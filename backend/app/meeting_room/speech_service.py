"""
Speech service wrappers for team-fit meeting simulation.

- Reuses existing Deepgram TTS helper from interview_agent.tts.
- Uses Deepgram STT HTTP API for turn-based transcription.
"""

from __future__ import annotations

import asyncio
import base64
import logging
import os
from typing import Any

import httpx

from app.interview_agent.tts import synthesize_question_audio_data_uri


logger = logging.getLogger(__name__)


def _extract_audio_payload(audio_base64: str) -> tuple[bytes, str | None]:
    raw = (audio_base64 or "").strip()
    if not raw:
        return b"", None

    if raw.startswith("data:") and ";base64," in raw:
        header, encoded = raw.split(";base64,", maxsplit=1)
        mime_type = header[5:] if len(header) > 5 else None
        return base64.b64decode(encoded), mime_type

    return base64.b64decode(raw), None


async def synthesize_text_to_data_uri(text: str) -> str | None:
    return await asyncio.to_thread(synthesize_question_audio_data_uri, text)


async def transcribe_audio_base64(
    audio_base64: str,
    audio_mime_type: str | None = None,
) -> str:
    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        logger.error("DEEPGRAM_API_KEY missing; cannot transcribe meeting response")
        return ""

    try:
        audio_bytes, embedded_mime = _extract_audio_payload(audio_base64)
    except Exception:
        logger.exception("Failed to decode base64 audio payload")
        return ""

    if not audio_bytes:
        logger.warning("Meeting STT called with empty audio bytes")
        return ""

    mime_type = (audio_mime_type or embedded_mime or "audio/webm").strip()
    params = {
        "model": os.getenv("MEETING_STT_MODEL", "nova-2"),
        "smart_format": "true",
        "punctuate": "true",
        "language": "en",
    }

    headers = {
        "Authorization": f"Token {api_key}",
        "Content-Type": mime_type,
    }

    try:
        logger.info(
            "Calling Deepgram STT for meeting response",
            extra={"mime_type": mime_type, "audio_bytes": len(audio_bytes)},
        )
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(
                "https://api.deepgram.com/v1/listen",
                params=params,
                headers=headers,
                content=audio_bytes,
            )
            response.raise_for_status()
            payload: dict[str, Any] = response.json()

        alternatives = (
            payload.get("results", {})
            .get("channels", [{}])[0]
            .get("alternatives", [{}])
        )
        transcript = str(alternatives[0].get("transcript") or "").strip()
        if not transcript:
            logger.warning(
                "Deepgram STT returned empty transcript for meeting response",
                extra={
                    "mime_type": mime_type,
                    "audio_bytes": len(audio_bytes),
                    "has_results": bool(payload.get("results")),
                },
            )
        else:
            logger.info(
                "Deepgram STT transcript generated for meeting response",
                extra={"transcript_length": len(transcript)},
            )
        return transcript
    except Exception:
        logger.exception("Deepgram STT transcription failed for meeting response")
        return ""
