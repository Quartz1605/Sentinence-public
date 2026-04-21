import asyncio
import json
import logging
import os
from dataclasses import dataclass

import websockets


logger = logging.getLogger(__name__)


@dataclass
class STTTranscriptEvent:
    text: str
    is_final: bool


class StreamingSTTEngine:
    """Deepgram-backed streaming STT for realtime interview agent."""

    def __init__(self) -> None:
        self._url = (
            "wss://api.deepgram.com/v1/listen"
            "?model=nova-2"
            "&encoding=linear16"
            "&sample_rate=16000"
            "&channels=1"
            "&interim_results=true"
            "&smart_format=true"
            "&endpointing=300"
        )
        self._api_key = os.getenv("DEEPGRAM_API_KEY")
        self._ws = None
        self._listen_task: asyncio.Task | None = None
        self._events: asyncio.Queue[STTTranscriptEvent] = asyncio.Queue()
        self._latest_partial: str = ""

    async def connect(self) -> None:
        if not self._api_key:
            raise RuntimeError("DEEPGRAM_API_KEY is not set")

        headers = {"Authorization": f"Token {self._api_key}"}
        self._ws = await websockets.connect(self._url, additional_headers=headers)
        self._listen_task = asyncio.create_task(self._listen_loop())
        logger.info("Interview-agent STT engine connected to Deepgram")

    async def send_audio_chunk(self, pcm_bytes: bytes) -> None:
        if not self._ws:
            return
        try:
            await self._ws.send(pcm_bytes)
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Deepgram websocket closed while sending audio chunk")

    async def mark_client_audio_end(self) -> None:
        # If endpointing has not flushed yet, force final transcript from latest partial.
        forced = self._latest_partial.strip()
        if forced:
            await self._events.put(STTTranscriptEvent(text=forced, is_final=True))
            logger.info("Forced STT finalization from latest partial", extra={"final_length": len(forced)})
            self._latest_partial = ""

    async def next_event(self) -> STTTranscriptEvent:
        return await self._events.get()

    async def reset_stream(self) -> None:
        await self.close()
        while not self._events.empty():
            try:
                self._events.get_nowait()
            except asyncio.QueueEmpty:
                break
        self._latest_partial = ""
        await self.connect()
        logger.info("STT stream reset after interruption")

    async def close(self) -> None:
        if self._ws:
            try:
                await self._ws.send(json.dumps({"type": "CloseStream"}))
                await asyncio.sleep(0.1)
            except Exception:
                pass

            try:
                await self._ws.close()
            except Exception:
                pass

        if self._listen_task:
            self._listen_task.cancel()
            self._listen_task = None

        self._ws = None
        logger.info("Interview-agent STT engine closed")

    async def _listen_loop(self) -> None:
        if not self._ws:
            return

        try:
            async for message in self._ws:
                data = json.loads(message)
                channel = data.get("channel")
                if not channel:
                    continue

                alternatives = channel.get("alternatives") or []
                if not alternatives:
                    continue

                transcript = str(alternatives[0].get("transcript") or "").strip()
                if not transcript:
                    continue

                is_final = bool(data.get("is_final") or data.get("speech_final"))
                self._latest_partial = transcript
                await self._events.put(STTTranscriptEvent(text=transcript, is_final=is_final))
                logger.info(
                    "STT transcript event received",
                    extra={"is_final": is_final, "length": len(transcript)},
                )

                if is_final:
                    self._latest_partial = ""
        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed:
            logger.warning("Deepgram websocket closed during listen loop")
        except Exception:
            logger.exception("Deepgram listen loop failed")
