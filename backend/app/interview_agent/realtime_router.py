import asyncio
import base64
import json
import logging
import os
from dataclasses import dataclass
from typing import Any

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.auth.jwt import decode_token
from app.auth.service import get_users_collection
from app.interview_agent.llm import stream_realtime_reply_tokens
from app.interview_agent.stt_stream import STTTranscriptEvent, StreamingSTTEngine
from app.interview_agent.streaming import tts_chunk_buffer
from app.interview_agent.tts import synthesize_speech_audio


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/interview-agent", tags=["Interview Agent Realtime"])


@dataclass
class AudioInEvent:
    generation: int
    pcm_bytes: bytes | None = None
    is_end: bool = False


@dataclass
class TranscriptEvent:
    generation: int
    text: str


@dataclass
class TTSChunkEvent:
    generation: int
    text: str
    is_end: bool = False


async def _get_ws_user(websocket: WebSocket) -> dict[str, Any] | None:
    access_token = websocket.cookies.get("access_token") or websocket.query_params.get("token")
    if not access_token:
        logger.warning("Realtime WS auth failed: missing access token")
        return None

    try:
        payload = decode_token(token=access_token, expected_type="access")
        user_id = ObjectId(payload["user_id"])
    except Exception:
        logger.exception("Realtime WS auth token decode failed")
        return None

    users = get_users_collection()
    user = await users.find_one({"_id": user_id})
    if not user:
        logger.warning("Realtime WS auth failed: user not found", extra={"user_id": str(user_id)})
        return None

    return user


@router.websocket("/ws")
async def interview_agent_realtime(websocket: WebSocket):
    await websocket.accept()

    user = await _get_ws_user(websocket)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    user_id = str(user["_id"])
    logger.info("Interview realtime websocket connected", extra={"user_id": user_id})

    stt_engine = StreamingSTTEngine()
    await stt_engine.connect()

    audio_queue: asyncio.Queue[AudioInEvent | None] = asyncio.Queue()
    transcript_queue: asyncio.Queue[TranscriptEvent | None] = asyncio.Queue()
    tts_queue: asyncio.Queue[TTSChunkEvent | None] = asyncio.Queue()

    state = {
        "generation": 1,
        "ai_speaking": False,
    }
    generation_lock = asyncio.Lock()

    async def interrupt_current_pipeline(reason: str) -> None:
        async with generation_lock:
            state["generation"] += 1
            state["ai_speaking"] = False
            generation = state["generation"]

        logger.info(
            "Interrupting realtime pipeline",
            extra={"user_id": user_id, "generation": generation, "reason": reason},
        )

        while not transcript_queue.empty():
            try:
                transcript_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        while not tts_queue.empty():
            try:
                tts_queue.get_nowait()
            except asyncio.QueueEmpty:
                break

        await stt_engine.reset_stream()

        await websocket.send_text(
            json.dumps(
                {
                    "type": "ai_interrupted",
                    "generation": generation,
                    "reason": reason,
                }
            )
        )

    async def audio_ingest_worker() -> None:
        while True:
            item = await audio_queue.get()
            if item is None:
                return

            if item.generation != state["generation"]:
                continue

            if item.is_end:
                await stt_engine.mark_client_audio_end()
                continue

            if item.pcm_bytes:
                await stt_engine.send_audio_chunk(item.pcm_bytes)

    async def stt_event_worker() -> None:
        while True:
            event: STTTranscriptEvent = await stt_engine.next_event()
            generation = state["generation"]

            if event.is_final:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "stt_final",
                            "generation": generation,
                            "text": event.text,
                        }
                    )
                )
                await transcript_queue.put(TranscriptEvent(generation=generation, text=event.text))
            else:
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "stt_partial",
                            "generation": generation,
                            "text": event.text,
                        }
                    )
                )

    async def llm_worker() -> None:
        while True:
            item = await transcript_queue.get()
            if item is None:
                return

            generation = item.generation
            logger.info(
                "LLM worker consuming transcript",
                extra={"user_id": user_id, "generation": generation, "text_length": len(item.text)},
            )

            await websocket.send_text(json.dumps({"type": "ai_state", "state": "thinking", "generation": generation}))

            token_stream = stream_realtime_reply_tokens(
                user_text=item.text,
                role=os.getenv("INTERVIEW_REALTIME_ROLE", "Full Stack Engineer"),
                difficulty=os.getenv("INTERVIEW_REALTIME_DIFFICULTY", "medium"),
                persona=os.getenv("INTERVIEW_REALTIME_PERSONA", "mentor"),
            )

            async for chunk in tts_chunk_buffer(token_stream):
                if generation != state["generation"]:
                    logger.info(
                        "Dropping stale LLM output due to interrupt",
                        extra={"user_id": user_id, "generation": generation},
                    )
                    break

                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "llm_chunk",
                            "generation": generation,
                            "text": chunk,
                        }
                    )
                )
                await tts_queue.put(TTSChunkEvent(generation=generation, text=chunk))

            await tts_queue.put(TTSChunkEvent(generation=generation, text="", is_end=True))

    async def tts_worker() -> None:
        while True:
            item = await tts_queue.get()
            if item is None:
                return

            if item.generation != state["generation"]:
                continue

            if item.is_end:
                state["ai_speaking"] = False
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "ai_state",
                            "state": "idle",
                            "generation": item.generation,
                        }
                    )
                )
                continue

            if not state["ai_speaking"]:
                state["ai_speaking"] = True
                await websocket.send_text(
                    json.dumps(
                        {
                            "type": "ai_state",
                            "state": "speaking",
                            "generation": item.generation,
                        }
                    )
                )

            audio_result = await asyncio.to_thread(synthesize_speech_audio, item.text)
            if audio_result is None:
                logger.warning("TTS returned no audio chunk", extra={"generation": item.generation})
                continue

            mime, audio_bytes = audio_result
            payload = {
                "type": "ai_audio_chunk",
                "generation": item.generation,
                "mime": mime,
                "text": item.text,
                "audio_b64": base64.b64encode(audio_bytes).decode("utf-8"),
            }
            await websocket.send_text(json.dumps(payload))

            # Optional tiny delay for natural pacing.
            await asyncio.sleep(0.04)

    workers = [
        asyncio.create_task(audio_ingest_worker()),
        asyncio.create_task(stt_event_worker()),
        asyncio.create_task(llm_worker()),
        asyncio.create_task(tts_worker()),
    ]

    try:
        while True:
            message = await websocket.receive()

            if message.get("bytes") is not None:
                if state["ai_speaking"]:
                    await interrupt_current_pipeline(reason="new_audio_while_ai_speaking")

                generation = state["generation"]
                await audio_queue.put(AudioInEvent(generation=generation, pcm_bytes=message["bytes"], is_end=False))
                continue

            text_payload = message.get("text")
            if text_payload is None:
                continue

            payload = json.loads(text_payload)
            msg_type = payload.get("type")

            if msg_type == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
                continue

            if msg_type == "interrupt":
                await interrupt_current_pipeline(reason="client_interrupt")
                continue

            if msg_type == "audio_end":
                generation = state["generation"]
                await audio_queue.put(AudioInEvent(generation=generation, is_end=True))
                continue

            await websocket.send_text(json.dumps({"type": "error", "message": "Unsupported message type"}))

    except WebSocketDisconnect:
        logger.info("Interview realtime websocket disconnected", extra={"user_id": user_id})
    except Exception:
        logger.exception("Interview realtime websocket failed", extra={"user_id": user_id})
    finally:
        for queue in (audio_queue, transcript_queue, tts_queue):
            await queue.put(None)

        for task in workers:
            task.cancel()

        await stt_engine.close()
        logger.info("Interview realtime websocket cleanup complete", extra={"user_id": user_id})
