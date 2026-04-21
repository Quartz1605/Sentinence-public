import asyncio
import json
import logging
import os
import re
from typing import Any

from dotenv import load_dotenv
from fastapi import HTTPException, status
from openai import OpenAI
from pydantic import ValidationError

from app.resume_parser.schemas import ATSAnalysis, ParsedResume

load_dotenv()

logger = logging.getLogger(__name__)

OPENROUTER_MODEL = "google/gemini-2.0-flash-001"
MAX_LLM_RETRIES = 2

PARSED_RESUME_SCHEMA_TEMPLATE = {
    "name": "string | null",
    "email": "string | null",
    "phone": "string | null",
    "summary": "string | null",
    "skills": ["string"],
    "education": ["string"],
    "experience": [
        {
            "company": "string | null",
            "role": "string | null",
            "duration": "string | null",
            "description": "string | null",
        }
    ],
}

ATS_ANALYSIS_SCHEMA_TEMPLATE = {
    "overall_score": "integer 0-100",
    "score_breakdown": {
        "keyword_alignment": "integer 0-100",
        "formatting": "integer 0-100",
        "readability": "integer 0-100",
        "section_completeness": "integer 0-100",
    },
    "strengths": ["string"],
    "wording_tips": ["string"],
    "formatting_tips": ["string"],
    "useful_insights": ["string"],
}

PARSER_SYSTEM_PROMPT = (
    "You are an expert resume parser. Extract structured and accurate information. "
    "Do not hallucinate. If a field is not present, use null. "
    "Return clean JSON only with no markdown and no extra text."
)

ATS_SYSTEM_PROMPT = (
    "You are an expert ATS (Applicant Tracking System) resume reviewer. "
    "Provide practical, concrete, and concise feedback from the given resume only. "
    "Return clean JSON only with no markdown and no extra text."
)


def _strip_code_fences(raw: str) -> str:
    cleaned = raw.strip()
    cleaned = re.sub(r"^```(?:json)?", "", cleaned).strip()
    cleaned = re.sub(r"```$", "", cleaned).strip()
    return cleaned


def _normalize_string_list(value: Any) -> list[str]:
    if value is None:
        return []

    if isinstance(value, str):
        parts = re.split(r"[\n;]+", value)
        return [item.strip(" -\t\r\n") for item in parts if item and item.strip()]

    if isinstance(value, list):
        items: list[str] = []
        for item in value:
            if item is None:
                continue
            text = str(item).strip()
            if text:
                items.append(text)
        return items

    return []


def _coerce_score(value: Any) -> int | None:
    if value is None or isinstance(value, bool):
        return None

    if isinstance(value, (int, float)):
        return max(0, min(100, int(round(float(value)))))

    if isinstance(value, str):
        match = re.search(r"-?\d+(?:\.\d+)?", value)
        if not match:
            return None
        return max(0, min(100, int(round(float(match.group(0))))))

    return None


def _normalize_resume_keys(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("LLM output must be a JSON object")

    normalized = dict(payload)

    key_aliases = {
        "full_name": "name",
        "email_address": "email",
        "mail": "email",
        "phone_number": "phone",
        "ai_summary": "summary",
        "profile_summary": "summary",
        "professional_summary": "summary",
        "work_experience": "experience",
    }
    for source_key, target_key in key_aliases.items():
        if source_key in normalized and target_key not in normalized:
            normalized[target_key] = normalized[source_key]

    if isinstance(normalized.get("skills"), str):
        normalized["skills"] = [item.strip() for item in normalized["skills"].split(",") if item.strip()]

    if isinstance(normalized.get("education"), str):
        normalized["education"] = [item.strip() for item in re.split(r"[\n;]+", normalized["education"]) if item.strip()]

    experience = normalized.get("experience")
    if isinstance(experience, dict):
        experience = [experience]
    if isinstance(experience, list):
        rebuilt: list[dict[str, Any]] = []
        for item in experience:
            if not isinstance(item, dict):
                continue
            rebuilt.append(
                {
                    "company": item.get("company") or item.get("organization"),
                    "role": item.get("role") or item.get("title"),
                    "duration": item.get("duration") or item.get("period"),
                    "description": item.get("description") or item.get("details")
                }
            )
        normalized["experience"] = rebuilt

    return normalized


def _normalize_ats_analysis(payload: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise ValueError("LLM output must be a JSON object")

    normalized = dict(payload)
    key_aliases = {
        "ats_score": "overall_score",
        "overall": "overall_score",
        "score": "overall_score",
        "score_breakdowns": "score_breakdown",
        "breakdown": "score_breakdown",
        "wording_suggestions": "wording_tips",
        "wording_improvements": "wording_tips",
        "format_tips": "formatting_tips",
        "formatting_suggestions": "formatting_tips",
        "insights": "useful_insights",
        "additional_insights": "useful_insights",
    }
    for source_key, target_key in key_aliases.items():
        if source_key in normalized and target_key not in normalized:
            normalized[target_key] = normalized[source_key]

    breakdown = normalized.get("score_breakdown")
    if not isinstance(breakdown, dict):
        breakdown = {}

    breakdown_aliases = {
        "keywords": "keyword_alignment",
        "keyword_score": "keyword_alignment",
        "keyword_match": "keyword_alignment",
        "structure": "formatting",
        "sections": "section_completeness",
        "section_coverage": "section_completeness",
    }
    for source_key, target_key in breakdown_aliases.items():
        if source_key in breakdown and target_key not in breakdown:
            breakdown[target_key] = breakdown[source_key]

    normalized_breakdown = {
        "keyword_alignment": _coerce_score(breakdown.get("keyword_alignment")),
        "formatting": _coerce_score(breakdown.get("formatting")),
        "readability": _coerce_score(breakdown.get("readability")),
        "section_completeness": _coerce_score(breakdown.get("section_completeness")),
    }
    if any(score is not None for score in normalized_breakdown.values()):
        normalized["score_breakdown"] = normalized_breakdown
    else:
        normalized["score_breakdown"] = None

    overall_score = _coerce_score(normalized.get("overall_score"))
    if overall_score is None and normalized["score_breakdown"]:
        component_scores = [
            score for score in normalized["score_breakdown"].values() if score is not None
        ]
        if component_scores:
            overall_score = int(round(sum(component_scores) / len(component_scores)))

    normalized["overall_score"] = overall_score
    normalized["strengths"] = _normalize_string_list(normalized.get("strengths"))
    normalized["wording_tips"] = _normalize_string_list(normalized.get("wording_tips"))
    normalized["formatting_tips"] = _normalize_string_list(normalized.get("formatting_tips"))
    normalized["useful_insights"] = _normalize_string_list(normalized.get("useful_insights"))

    return normalized


def _build_parse_user_prompt(resume_text: str, *, repair_mode: bool) -> str:
    repair_line = ""
    if repair_mode:
        repair_line = "Your previous response was invalid. Return strict JSON only."

    return (
        f"{repair_line}\n"
        "Extract resume data into this exact JSON schema:\n"
        f"{json.dumps(PARSED_RESUME_SCHEMA_TEMPLATE, indent=2)}\n"
        "Rules:\n"
        "1) Use only information present in the resume text.\n"
        "2) Missing fields must be null.\n"
        "3) summary must be a short AI-generated overview of the candidate based only on resume text.\n"
        "4) skills and education must be arrays when available.\n"
        "5) experience must be an array of objects.\n"
        "6) Return only JSON object with no extra commentary.\n\n"
        f"Resume Text:\n{resume_text}"
    )


def _build_ats_user_prompt(
    resume_text: str,
    parsed_resume: dict[str, Any],
    *,
    repair_mode: bool,
) -> str:
    repair_line = ""
    if repair_mode:
        repair_line = "Your previous response was invalid. Return strict JSON only."

    return (
        f"{repair_line}\n"
        "Analyze the resume for ATS readiness and actionable improvements using this exact JSON schema:\n"
        f"{json.dumps(ATS_ANALYSIS_SCHEMA_TEMPLATE, indent=2)}\n"
        "Rules:\n"
        "1) Scores must be integers from 0 to 100.\n"
        "2) Give concise and practical tips.\n"
        "3) wording_tips must improve impact, clarity, and measurable outcomes in resume bullet points.\n"
        "4) formatting_tips must focus on layout, section structure, consistency, and ATS readability.\n"
        "5) useful_insights should include other high-value resume observations or risk areas.\n"
        "6) Return only a JSON object with no extra commentary.\n\n"
        f"Parsed Resume JSON:\n{json.dumps(parsed_resume, indent=2)}\n\n"
        f"Resume Text:\n{resume_text}"
    )


async def _call_openrouter_api(*, system_prompt: str, user_prompt: str) -> str:
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Missing OPENROUTER_API_KEY",
        )

    client = OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )

    try:
        completion = await asyncio.to_thread(
            client.chat.completions.create,
            model=OPENROUTER_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            extra_headers={
                "HTTP-Referer": os.getenv("OPENROUTER_REFERER", "http://localhost:8000"),
                "X-OpenRouter-Title": os.getenv("OPENROUTER_APP_TITLE", "se-hack-resume-parser"),
            },
            extra_body={
                "response_format": {"type": "json_object"},
                "temperature": 0,
            },
            timeout=90,
        )
    except Exception as exc:
        logger.exception("OpenRouter OpenAI SDK request failed")
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenRouter request failed",
        ) from exc

    choices = getattr(completion, "choices", None) or []
    if not choices:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenRouter returned no choices",
        )

    content = choices[0].message.content
    if isinstance(content, list):
        text_chunks = [chunk.text for chunk in content if getattr(chunk, "text", None)]
        content = "\n".join(text_chunks)

    if not isinstance(content, str) or not content.strip():
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="OpenRouter returned empty content",
        )

    return content


async def parse_resume_with_llm(resume_text: str) -> dict[str, Any]:
    parsing_error: Exception | None = None

    for attempt in range(MAX_LLM_RETRIES + 1):
        raw_output = await _call_openrouter_api(
            system_prompt=PARSER_SYSTEM_PROMPT,
            user_prompt=_build_parse_user_prompt(resume_text, repair_mode=attempt > 0),
        )
        try:
            parsed = json.loads(_strip_code_fences(raw_output))
            normalized = _normalize_resume_keys(parsed)
            validated = ParsedResume.model_validate(normalized)
            return validated.model_dump()
        except (json.JSONDecodeError, ValueError, ValidationError) as exc:
            parsing_error = exc
            logger.warning("Retrying OpenRouter parse due to invalid JSON. Attempt=%s", attempt + 1)

    logger.error("Failed to parse OpenRouter output after retries")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Failed to parse OpenRouter JSON response: {parsing_error}",
    )


async def analyze_resume_ats_with_llm(
    resume_text: str,
    parsed_resume: dict[str, Any],
) -> dict[str, Any]:
    parsing_error: Exception | None = None

    for attempt in range(MAX_LLM_RETRIES + 1):
        raw_output = await _call_openrouter_api(
            system_prompt=ATS_SYSTEM_PROMPT,
            user_prompt=_build_ats_user_prompt(
                resume_text,
                parsed_resume,
                repair_mode=attempt > 0,
            ),
        )

        try:
            parsed = json.loads(_strip_code_fences(raw_output))
            normalized = _normalize_ats_analysis(parsed)
            validated = ATSAnalysis.model_validate(normalized)
            return validated.model_dump()
        except (json.JSONDecodeError, ValueError, ValidationError) as exc:
            parsing_error = exc
            logger.warning("Retrying OpenRouter ATS analysis due to invalid JSON. Attempt=%s", attempt + 1)

    logger.error("Failed to parse ATS analysis output after retries")
    raise HTTPException(
        status_code=status.HTTP_502_BAD_GATEWAY,
        detail=f"Failed to parse OpenRouter ATS analysis JSON response: {parsing_error}",
    )
