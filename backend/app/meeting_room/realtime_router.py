"""
Realtime meeting-room speech transcription websocket.

This mirrors the app.voice websocket pattern but is scoped to meeting-room usage.
"""

import asyncio
import json
import logging

from bson import ObjectId
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status

from app.auth.jwt import decode_token
from app.auth.service import get_users_collection
from app.voice.stt_engine import DeepgramEngine


logger = logging.getLogger(__name__)
router = APIRouter(prefix="/meeting-room", tags=["Meeting Room Realtime"])


async def get_ws_user(websocket: WebSocket):
    access_token = websocket.cookies.get("access_token")
    if not access_token:
        access_token = websocket.query_params.get("token")

    if not access_token:
        return None

    try:
        payload = decode_token(token=access_token, expected_type="access")
        user_id = ObjectId(payload["user_id"])
    except Exception as exc:
        logger.error("Meeting-room realtime auth decode failed", extra={"error": str(exc)})
        return None

    users = get_users_collection()
    user = await users.find_one({"_id": user_id})
    return user


@router.websocket("/transcribe")
async def meeting_room_transcribe(websocket: WebSocket):
    await websocket.accept()

    user = await get_ws_user(websocket)
    if not user:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized")
        return

    user_id = str(user["_id"])
    logger.info("Meeting realtime transcription connected", extra={"user_id": user_id})

    words_buffer: list[str] = []
    ws_lock = asyncio.Lock()

    async def safe_send(data: dict):
        try:
            async with ws_lock:
                await websocket.send_text(json.dumps(data))
        except Exception:
            pass

    def on_word_received(word_data: dict):
        word = (word_data or {}).get("word")
        if not word:
            return

        words_buffer.append(str(word))

        try:
            asyncio.get_event_loop().create_task(
                safe_send(
                    {
                        "type": "transcript_word",
                        "word": word,
                        "start": word_data.get("start", 0),
                        "end": word_data.get("end", 0),
                        "text": " ".join(words_buffer),
                    }
                )
            )
        except Exception:
            pass

    deepgram = DeepgramEngine(on_word=on_word_received)
    await deepgram.connect()

    try:
        while True:
            message = await websocket.receive()

            if "bytes" in message and message["bytes"]:
                await deepgram.send_audio(message["bytes"])
                continue

            if "text" in message and message["text"]:
                text_data = message["text"]

                if text_data == "CLEAR":
                    words_buffer.clear()
                    await safe_send({"type": "transcript_cleared"})
                    continue

                if text_data == "STOP":
                    await safe_send(
                        {
                            "type": "transcript_final",
                            "text": " ".join(words_buffer).strip(),
                        }
                    )
                    logger.info(
                        "Meeting realtime transcription stopped",
                        extra={"user_id": user_id, "word_count": len(words_buffer)},
                    )
                    break

    except WebSocketDisconnect:
        logger.info("Meeting realtime transcription disconnected", extra={"user_id": user_id})
    except Exception as exc:
        logger.exception(
            "Meeting realtime transcription websocket failed",
            extra={"user_id": user_id, "error": str(exc)},
        )
    finally:
        await deepgram.close()
        try:
            await websocket.close()
        except Exception:
            pass
