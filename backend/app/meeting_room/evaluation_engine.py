"""
Response evaluation engine for team-fit meeting simulation.
"""

from __future__ import annotations

import re
from typing import Any


INTENT_KEYWORDS: dict[str, set[str]] = {
    "problem_solving": {"debug", "logs", "root cause", "incident", "rollback", "mitigation"},
    "technical_reasoning": {"latency", "service", "database", "api", "monitoring", "trace"},
    "cross_team_collaboration": {"frontend", "backend", "product", "qa", "support", "handoff"},
    "ownership": {"owner", "accountable", "timeline", "deliver", "follow-up", "update"},
    "prevention": {"test", "guardrail", "alert", "slo", "postmortem", "automation"},
    "planning": {"plan", "milestone", "timeline", "risk", "priority", "readiness"},
    "risk_management": {"risk", "impact", "rollback", "contingency", "failure", "monitor"},
    "decision_making": {"trade-off", "decision", "criteria", "go", "no-go", "fallback"},
    "execution": {"execute", "ship", "assign", "track", "deliver", "iterate"},
    "problem_framing": {"context", "issue", "scope", "objective", "constraint", "goal"},
    "conflict_resolution": {"align", "resolve", "conflict", "facilitate", "listen", "consensus"},
    "stakeholder_communication": {"leadership", "stakeholder", "update", "communication", "status", "expectation"},
    "outcome_orientation": {"metric", "signal", "result", "impact", "measure", "kpi"},
}


CONFIDENT_PHRASES = {
    "i will",
    "we will",
    "i can",
    "we can",
    "first",
    "next",
    "then",
    "immediately",
    "ownership",
}

HEDGING_PHRASES = {
    "maybe",
    "might",
    "i think",
    "probably",
    "not sure",
    "guess",
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", (text or "").strip().lower())


def _tokenize(text: str) -> list[str]:
    return re.findall(r"[a-zA-Z0-9']+", _normalize(text))


def _clip(score: float, low: float = 0.0, high: float = 10.0) -> float:
    return max(low, min(high, score))


def _score_clarity(answer: str) -> float:
    cleaned = _normalize(answer)
    tokens = _tokenize(cleaned)
    word_count = len(tokens)
    sentence_count = max(1, len(re.findall(r"[.!?]", answer)))

    score = 4.5
    if 20 <= word_count <= 130:
        score += 2.4
    elif word_count > 10:
        score += 1.3

    if sentence_count >= 2:
        score += 1.5
    if any(connector in cleaned for connector in ["because", "therefore", "so that", "first", "second", "finally"]):
        score += 1.0

    return _clip(score)


def _score_technical_reasoning(answer: str, intent: str) -> float:
    cleaned = _normalize(answer)
    score = 3.8

    intent_terms = INTENT_KEYWORDS.get(intent, set())
    matched = sum(1 for term in intent_terms if term in cleaned)
    score += min(matched * 0.9, 3.5)

    if any(term in cleaned for term in ["root cause", "trade-off", "impact", "monitor", "rollback", "test"]):
        score += 1.4

    if any(term in cleaned for term in ["step", "plan", "owner", "timeline"]):
        score += 1.1

    return _clip(score)


def _score_confidence(answer: str) -> float:
    cleaned = _normalize(answer)
    score = 4.8

    confident_hits = sum(1 for phrase in CONFIDENT_PHRASES if phrase in cleaned)
    hedge_hits = sum(1 for phrase in HEDGING_PHRASES if phrase in cleaned)

    score += min(confident_hits * 0.8, 3.0)
    score -= min(hedge_hits * 0.9, 3.0)

    return _clip(score)


def _score_relevance(answer: str, question: str, intent: str) -> float:
    answer_tokens = set(_tokenize(answer))
    question_tokens = set(_tokenize(question))

    if not answer_tokens:
        return 0.0

    overlap = len(answer_tokens & question_tokens)
    lexical_relevance = min(overlap / max(4, len(question_tokens) * 0.18), 1.0)

    cleaned = _normalize(answer)
    intent_terms = INTENT_KEYWORDS.get(intent, set())
    intent_hits = sum(1 for term in intent_terms if term in cleaned)
    intent_relevance = min(intent_hits / 3.0, 1.0)

    score = 3.5 + lexical_relevance * 3.1 + intent_relevance * 3.4
    return _clip(score)


def _generate_feedback(dims: dict[str, float]) -> tuple[list[str], list[str], str]:
    strengths: list[str] = []
    improvements: list[str] = []

    if dims["clarity"] >= 7.0:
        strengths.append("Your explanation was clear and easy to follow.")
    else:
        improvements.append("Structure your answer in explicit steps so teammates can execute quickly.")

    if dims["technical_reasoning"] >= 7.0:
        strengths.append("You showed solid technical reasoning with practical actions.")
    else:
        improvements.append("Add concrete technical signals like logs, metrics, and rollback criteria.")

    if dims["confidence"] >= 7.0:
        strengths.append("Your tone sounded decisive under pressure.")
    else:
        improvements.append("Use stronger ownership language and reduce hedging words.")

    if dims["relevance"] >= 7.0:
        strengths.append("Your response stayed aligned with the teammate question.")
    else:
        improvements.append("Address the exact question first before adding extra context.")

    if not strengths:
        strengths.append("You stayed engaged and responded directly in the meeting flow.")
    if not improvements:
        improvements.append("Add brief success metrics to make your plan even more actionable.")

    summary = "Good explanation overall." if len(improvements) <= 1 else "Good explanation, but you can improve structure and depth for stronger interview impact."
    return strengths[:3], improvements[:3], summary


async def evaluate_response(
    *,
    question: str,
    intent: str,
    answer: str,
) -> dict[str, Any]:
    dims = {
        "clarity": _score_clarity(answer),
        "technical_reasoning": _score_technical_reasoning(answer, intent),
        "confidence": _score_confidence(answer),
        "relevance": _score_relevance(answer, question, intent),
    }

    overall = (
        dims["clarity"] * 0.25
        + dims["technical_reasoning"] * 0.35
        + dims["confidence"] * 0.2
        + dims["relevance"] * 0.2
    )
    strengths, improvements, summary = _generate_feedback(dims)

    return {
        "score": round(_clip(overall), 2),
        "feedback": summary,
        **{key: round(value, 2) for key, value in dims.items()},
        "strengths": strengths,
        "improvements": improvements,
    }


def aggregate_session_result(turns: list[dict[str, Any]]) -> dict[str, Any]:
    if not turns:
        return {
            "score": 0.0,
            "feedback": "No responses were submitted in this meeting session.",
            "dimension_scores": {
                "clarity": 0.0,
                "technical_reasoning": 0.0,
                "confidence": 0.0,
                "relevance": 0.0,
            },
            "strengths": [],
            "improvements": ["Provide answers to teammate prompts to receive evaluation feedback."],
            "summary": "Session ended without response data.",
        }

    evals = [turn.get("evaluation", {}) for turn in turns]

    def _avg(key: str) -> float:
        values = [float(e.get(key, 0.0)) for e in evals]
        if not values:
            return 0.0
        return round(sum(values) / len(values), 2)

    dimension_scores = {
        "clarity": _avg("clarity"),
        "technical_reasoning": _avg("technical_reasoning"),
        "confidence": _avg("confidence"),
        "relevance": _avg("relevance"),
    }
    final_score = _avg("score")

    strengths_pool: list[str] = []
    improvements_pool: list[str] = []
    for item in evals:
        strengths_pool.extend(item.get("strengths", []) or [])
        improvements_pool.extend(item.get("improvements", []) or [])

    strengths = list(dict.fromkeys(strengths_pool))[:4]
    improvements = list(dict.fromkeys(improvements_pool))[:4]

    summary = (
        f"You completed {len(turns)} responses with strongest performance in "
        f"{max(dimension_scores, key=dimension_scores.get).replace('_', ' ')}."
    )

    return {
        "score": final_score,
        "feedback": "Strong session. Keep sharpening structure and ownership signals." if final_score >= 7.5 else "Good effort. Focus on sharper technical structure and relevance.",
        "dimension_scores": dimension_scores,
        "strengths": strengths,
        "improvements": improvements,
        "summary": summary,
    }
