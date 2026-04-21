import re
from collections.abc import AsyncGenerator


def split_text_for_tts(text: str, *, min_chars: int = 40, max_chars: int = 180) -> list[str]:
    """Split LLM output into speech-friendly chunks with low latency."""
    cleaned = text.strip()
    if not cleaned:
        return []

    parts = re.split(r"(?<=[.!?])\s+", cleaned)
    chunks: list[str] = []
    current = ""

    for part in parts:
        if not part:
            continue
        candidate = f"{current} {part}".strip() if current else part

        if len(candidate) <= max_chars:
            current = candidate
            if len(current) >= min_chars or re.search(r"[.!?]$", current):
                chunks.append(current)
                current = ""
        else:
            if current:
                chunks.append(current)
            if len(part) <= max_chars:
                current = part
            else:
                # Hard split for extra-long spans.
                for i in range(0, len(part), max_chars):
                    chunk = part[i : i + max_chars].strip()
                    if chunk:
                        chunks.append(chunk)
                current = ""

    if current:
        chunks.append(current)

    return chunks


async def tts_chunk_buffer(token_stream: AsyncGenerator[str, None]) -> AsyncGenerator[str, None]:
    """Buffer LLM token stream into chunk-sized text for immediate TTS."""
    buffer = ""

    async for token in token_stream:
        if not token:
            continue

        buffer += token
        if len(buffer) < 40 and not re.search(r"[.!?]\s*$", buffer):
            continue

        ready_chunks = split_text_for_tts(buffer)
        if not ready_chunks:
            continue

        for chunk in ready_chunks[:-1]:
            yield chunk

        # Keep the most recent unfinished chunk in buffer.
        buffer = ready_chunks[-1]
        if re.search(r"[.!?]\s*$", buffer):
            yield buffer
            buffer = ""

    final = buffer.strip()
    if final:
        for chunk in split_text_for_tts(final, min_chars=1):
            yield chunk
