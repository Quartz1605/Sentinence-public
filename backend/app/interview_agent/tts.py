import base64
import logging
import os
from typing import Optional

from deepgram import DeepgramClient


logger = logging.getLogger(__name__)


def _detect_audio_mime(audio_bytes: bytes) -> str:
    if audio_bytes.startswith(b"RIFF"):
        return "audio/wav"
    if audio_bytes.startswith(b"ID3") or audio_bytes[:2] == b"\xff\xfb":
        return "audio/mpeg"
    if audio_bytes.startswith(b"OggS"):
        return "audio/ogg"
    return "audio/wav"


def synthesize_question_audio_data_uri(question: str) -> Optional[str]:
    text = question.strip()
    if not text:
        logger.warning("Skipping TTS synthesis because question text is empty")
        return None

    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        logger.error("DEEPGRAM_API_KEY missing; cannot synthesize question audio")
        return None

    model = os.getenv("INTERVIEW_TTS_MODEL", "aura-2-thalia-en")

    logger.info(
        "Starting Deepgram TTS synthesis",
        extra={"model": model, "question_length": len(text)},
    )

    try:
        audio_result = synthesize_speech_audio(text)
        if audio_result is None:
            logger.error("Deepgram TTS synthesis returned empty audio")
            return None

        mime, audio = audio_result
        encoded = base64.b64encode(audio).decode("utf-8")
        logger.info("TTS synthesis succeeded", extra={"mime": mime, "audio_bytes": len(audio)})
        return f"data:{mime};base64,{encoded}"
    except Exception:
        logger.exception("TTS synthesis failed")
        return None


def synthesize_speech_audio(text: str) -> Optional[tuple[str, bytes]]:
    cleaned = text.strip()
    if not cleaned:
        logger.warning("Skipping streaming TTS because text is empty")
        return None

    api_key = os.getenv("DEEPGRAM_API_KEY")
    if not api_key:
        logger.error("DEEPGRAM_API_KEY missing; cannot synthesize streaming speech audio")
        return None

    model = os.getenv("INTERVIEW_TTS_MODEL", "aura-2-thalia-en")

    try:
        deepgram = DeepgramClient(api_key=api_key)
        audio_chunks = deepgram.speak.v1.audio.generate(
            text=cleaned,
            model=model,
            encoding="mp3",
        )
        audio = b"".join(audio_chunks)

        if not audio:
            logger.error("Streaming TTS returned empty audio bytes")
            return None

        mime = _detect_audio_mime(audio)
        logger.info("Streaming TTS synthesis succeeded", extra={"mime": mime, "audio_bytes": len(audio), "model": model})
        return mime, audio
    except Exception:
        logger.exception("Deepgram streaming TTS synthesis failed")
        return None
