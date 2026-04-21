import json
import logging
import os
import re
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import HTTPException, status
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI


logger = logging.getLogger(__name__)


def _strip_code_fences(raw: str) -> str:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def _extract_text(content: Any) -> str:
    if isinstance(content, str):
        return content

    if isinstance(content, list):
        chunks: list[str] = []
        for item in content:
            if isinstance(item, dict) and isinstance(item.get("text"), str):
                chunks.append(item["text"])
            elif hasattr(item, "text") and isinstance(getattr(item, "text"), str):
                chunks.append(getattr(item, "text"))
        return "\n".join(chunks)

    return ""


def _parse_int_env(name: str, default: int, *, minimum: int = 1, maximum: int = 65535) -> int:
    raw = os.getenv(name, str(default))
    try:
        value = int(raw)
    except (TypeError, ValueError):
        value = default
    return max(minimum, min(maximum, value))


def _extract_affordable_tokens(error_text: str) -> int | None:
    match = re.search(r"can only afford\s+(\d+)", error_text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        value = int(match.group(1))
    except (TypeError, ValueError):
        return None
    return max(1, value)


def _is_credit_or_token_cap_error(error_text: str) -> bool:
    lowered = error_text.lower()
    return "requires more credits" in lowered or ("max_tokens" in lowered and "afford" in lowered)


def _build_chat_model(
    *,
    temperature_override: float | None = None,
    max_tokens_override: int | None = None,
    json_response: bool = True,
) -> ChatOpenAI:
    model = os.getenv("INTERVIEW_AGENT_MODEL", "google/gemini-2.0-flash-001")
    api_key = os.getenv("INTERVIEW_AGENT_API_KEY") or os.getenv("OPENROUTER_API_KEY") or os.getenv("OPENAI_API_KEY")
    base_url = os.getenv("INTERVIEW_AGENT_BASE_URL", "https://openrouter.ai/api/v1")
    timeout = float(os.getenv("INTERVIEW_AGENT_TIMEOUT_SECONDS", "90"))
    temperature = float(os.getenv("INTERVIEW_AGENT_TEMPERATURE", "0.35"))
    max_tokens = max_tokens_override or _parse_int_env("INTERVIEW_AGENT_MAX_OUTPUT_TOKENS", 1200, minimum=64, maximum=8192)
    if temperature_override is not None:
        temperature = temperature_override

    logger.info(
        "Building LLM client",
        extra={
            "model": model,
            "base_url": base_url,
            "temperature": temperature,
            "timeout": timeout,
            "max_tokens": max_tokens,
            "json_response": json_response,
        },
    )

    if not api_key:
        logger.error("Missing API key for interview agent LLM")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing INTERVIEW_AGENT_API_KEY/OPENROUTER_API_KEY/OPENAI_API_KEY",
        )

    headers: dict[str, str] = {}
    if "openrouter.ai" in base_url:
        headers = {
            "HTTP-Referer": os.getenv("OPENROUTER_REFERER", "http://localhost:8000"),
            "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_TITLE", "se-hack-interview-agent"),
        }

    model_kwargs: dict[str, Any] = {}
    if json_response:
        model_kwargs["response_format"] = {"type": "json_object"}

    return ChatOpenAI(
        model=model,
        api_key=api_key,
        base_url=base_url,
        timeout=timeout,
        temperature=temperature,
        max_tokens=max_tokens,
        default_headers=headers or None,
        model_kwargs=model_kwargs or None,
    )


async def invoke_llm_json(
    *,
    system_prompt: str,
    user_prompt: str,
    temperature: float | None = None,
) -> dict[str, Any]:
    current_max_tokens = _parse_int_env("INTERVIEW_AGENT_MAX_OUTPUT_TOKENS", 1200, minimum=64, maximum=8192)
    llm = _build_chat_model(temperature_override=temperature, max_tokens_override=current_max_tokens, json_response=True)
    retries = int(os.getenv("INTERVIEW_AGENT_MAX_RETRIES", "2"))
    last_error: Exception | None = None

    logger.info(
        "Invoking LLM JSON request",
        extra={
            "retries": retries,
            "system_prompt_length": len(system_prompt),
            "user_prompt_length": len(user_prompt),
        },
    )

    for attempt in range(retries + 1):
        try:
            logger.info("LLM attempt started", extra={"attempt": attempt + 1, "max_attempts": retries + 1})
            result = await llm.ainvoke(
                [
                    SystemMessage(content=system_prompt),
                    HumanMessage(content=user_prompt),
                ]
            )
            text = _extract_text(result.content)
            parsed = json.loads(_strip_code_fences(text))
            if not isinstance(parsed, dict):
                raise ValueError("LLM output is not a JSON object")
            logger.info("LLM attempt succeeded", extra={"attempt": attempt + 1, "response_length": len(text)})
            return parsed
        except Exception as exc:
            error_text = str(exc)

            if attempt < retries and _is_credit_or_token_cap_error(error_text):
                affordable = _extract_affordable_tokens(error_text)
                if affordable is not None:
                    next_max_tokens = max(64, min(current_max_tokens - 64, affordable - 32))
                else:
                    next_max_tokens = max(64, current_max_tokens // 2)

                if next_max_tokens < current_max_tokens:
                    logger.warning(
                        "Token cap error from provider; retrying with lower max_tokens",
                        extra={
                            "attempt": attempt + 1,
                            "current_max_tokens": current_max_tokens,
                            "next_max_tokens": next_max_tokens,
                        },
                    )
                    current_max_tokens = next_max_tokens
                    llm = _build_chat_model(
                        temperature_override=temperature,
                        max_tokens_override=current_max_tokens,
                        json_response=True,
                    )
                    last_error = exc
                    continue

            last_error = exc
            logger.exception("LLM attempt failed", extra={"attempt": attempt + 1})

    logger.error("LLM JSON invocation failed after retries")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Interview agent failed to return valid JSON: {last_error}",
    )


def _build_realtime_system_prompt(*, role: str, difficulty: str, persona: str) -> str:
    return (
        "You are an AI teammate in a live technical interview simulation. "
        "Reply in short, actionable phrases that can be spoken out loud naturally. "
        "Prefer clear prioritization and team coordination language. "
        f"Role context: {role}. Difficulty: {difficulty}. Persona: {persona}."
    )


async def stream_realtime_reply_tokens(
    *,
    user_text: str,
    role: str,
    difficulty: str,
    persona: str,
) -> AsyncGenerator[str, None]:
    realtime_max_tokens = _parse_int_env("INTERVIEW_AGENT_REALTIME_MAX_OUTPUT_TOKENS", 320, minimum=32, maximum=2048)
    llm = _build_chat_model(
        temperature_override=0.45,
        max_tokens_override=realtime_max_tokens,
        json_response=False,
    )
    system_prompt = _build_realtime_system_prompt(role=role, difficulty=difficulty, persona=persona)
    logger.info(
        "Starting realtime LLM token stream",
        extra={"role": role, "difficulty": difficulty, "persona": persona, "user_text_length": len(user_text)},
    )

    try:
        stream = llm.astream(
            [
                SystemMessage(content=system_prompt),
                HumanMessage(content=user_text),
            ]
        )
        async for chunk in stream:
            text = _extract_text(chunk.content)
            if text:
                yield text
    except Exception:
        logger.exception("Realtime LLM token stream failed")
        fallback = "Let us prioritize stability first, assign owners now, and validate with fast regression checks."
        yield fallback