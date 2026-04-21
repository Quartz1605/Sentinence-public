import websockets
import json
import os
import asyncio
import logging
from typing import Callable

logger = logging.getLogger(__name__)

class DeepgramEngine:
    def __init__(self, on_word: Callable[[dict], None]):
        self.url = "wss://api.deepgram.com/v1/listen?model=nova-2&encoding=linear16&sample_rate=16000&channels=1&smart_format=true&interim_results=true&endpointing=300"
        self.api_key = os.getenv("DEEPGRAM_API_KEY")
        self.ws = None
        self.on_word = on_word
        self.receive_task = None

    async def connect(self):
        if not self.api_key:
            logger.error("DEEPGRAM_API_KEY is not set.")
            return

        headers = {"Authorization": f"Token {self.api_key}"}
        try:
            self.ws = await websockets.connect(self.url, additional_headers=headers)
            print("[STT-Deepgram] Connected to Deepgram Streaming Endpoint.")
            self.receive_task = asyncio.create_task(self._listen())
        except Exception as e:
            logger.error(f"Failed to connect to Deepgram: {e}")

    async def send_audio(self, pcm_bytes: bytes):
        if self.ws:
             try:
                 await self.ws.send(pcm_bytes)
             except websockets.exceptions.ConnectionClosed:
                 pass

    async def close(self):
        try:
            if self.ws:
                # Tell Deepgram we are closing the stream so it flushes
                await self.ws.send(b'')
                await asyncio.sleep(0.5)
                await self.ws.close()
        except Exception:
            pass
            
        if self.receive_task:
            self.receive_task.cancel()

    async def _listen(self):
        try:
            async for message in self.ws:
                data = json.loads(message)
                is_final = data.get("is_final", False)
                if is_final and "channel" in data:
                    alternatives = data["channel"].get("alternatives", [])
                    if alternatives:
                        words = alternatives[0].get("words", [])
                        for w in words:
                            # Map keys to standard schema
                            mapped_word = {
                                "word": w.get("word"),
                                "start": w.get("start"),
                                "end": w.get("end")
                            }
                            self.on_word(mapped_word)
        except asyncio.CancelledError:
            pass
        except websockets.exceptions.ConnectionClosed:
            print("[STT-Deepgram] Connection closed natively.")
        except Exception as e:
            print(f"[STT-Deepgram] Error listening: {e}")
