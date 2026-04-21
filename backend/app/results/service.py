from __future__ import annotations

import json
import logging
from collections import Counter, defaultdict
from datetime import datetime, timezone
from typing import Any

from motor.motor_asyncio import AsyncIOMotorDatabase

from app.interview_agent.llm import invoke_llm_json


logger = logging.getLogger(__name__)


def get_results_analysis_collection(db: AsyncIOMotorDatabase):
    return db["results_analysis_snapshots"]


async def ensure_results_indexes(db: AsyncIOMotorDatabase) -> None:
    collection = get_results_analysis_collection(db)
    await collection.create_index("user_id", unique=True, name="uniq_results_analysis_user_id")
    await collection.create_index("generated_at", name="idx_results_analysis_generated_at")


def _to_percent(value: Any) -> float | None:
    if value is None:
        return None
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    if numeric <= 1.0:
        numeric *= 100.0
    return max(0.0, min(100.0, round(numeric, 1)))


def _mean(values: list[float]) -> float:
    if not values:
        return 0.0
    return round(sum(values) / len(values), 2)


def _session_date(raw: Any) -> str:
    if isinstance(raw, datetime):
        return raw.strftime("%Y-%m-%d")
    return ""


def _top_terms(items: list[str], limit: int) -> list[tuple[str, int]]:
    counter: Counter[str] = Counter()
    display_name: dict[str, str] = {}
    for item in items:
        label = str(item).strip()
        if not label:
            continue
        key = " ".join(label.lower().split())
        counter[key] += 1
        if key not in display_name:
            display_name[key] = label

    out: list[tuple[str, int]] = []
    for key, freq in counter.most_common(limit):
        out.append((display_name[key], int(freq)))
    return out


def _default_llm_insights(weaknesses: list[dict[str, Any]], strengths: list[dict[str, Any]], overview: dict[str, Any]) -> dict[str, Any]:
    weakness_items = [
        {
            "area": item["area"],
            "impact_score": item["impact_score"],
            "rationale": f"Observed {item['frequency']} times with average score {item['avg_score_when_observed']}.",
            "action_items": item["suggested_actions"][:3],
        }
        for item in weaknesses[:5]
    ]

    strength_items = [
        {
            "area": item["area"],
            "rationale": f"Consistently demonstrated across {item['frequency']} responses.",
        }
        for item in strengths[:5]
    ]

    avg_score = float(overview.get("avg_score", 0.0))
    delta = float(overview.get("improvement_delta", 0.0))
    trajectory = "improving" if delta > 1 else "declining" if delta < -1 else "steady"

    return {
        "summary": (
            f"You completed {overview.get('completed_sessions', 0)} completed sessions with an average score of {avg_score:.1f}. "
            "Use the priority weakness areas to direct deliberate practice."
        ),
        "trajectory": trajectory,
        "confidence_note": "Fallback synthesis used because LLM response was unavailable.",
        "key_weaknesses": weakness_items,
        "key_strengths": strength_items,
        "coaching_plan": [
            {
                "phase": "Week 1",
                "objective": "Stabilize answer structure",
                "action_items": [
                    "Answer every question in Problem -> Approach -> Outcome format",
                    "Add one metric or measurable impact in each answer",
                ],
                "success_metric": "Average score increases by at least 5 points over next 3 sessions",
            },
            {
                "phase": "Week 2",
                "objective": "Target top weakness clusters",
                "action_items": [
                    "Practice 5 prompts focused on the top 2 weakness areas",
                    "Record responses and self-review clarity and conciseness",
                ],
                "success_metric": "Weakness frequency drops in next completed session",
            },
        ],
        "focus_radar": [
            {"metric": "Technical Depth", "score": max(10.0, min(100.0, avg_score - 5.0))},
            {"metric": "Communication", "score": max(10.0, min(100.0, avg_score))},
            {"metric": "Problem Solving", "score": max(10.0, min(100.0, avg_score + 2.0))},
            {"metric": "Behavioral Clarity", "score": max(10.0, min(100.0, avg_score - 3.0))},
            {"metric": "Consistency", "score": max(10.0, min(100.0, avg_score + delta))},
            {"metric": "Confidence", "score": max(10.0, min(100.0, avg_score + 1.0))},
        ],
        "weakness_heatmap": [
            {
                "area": item["area"],
                "technical": min(100.0, round(item["impact_score"], 1)),
                "communication": min(100.0, round(item["impact_score"] * 0.8, 1)),
                "consistency": min(100.0, round(item["impact_score"] * 0.7, 1)),
            }
            for item in weaknesses[:6]
        ],
    }


def _sanitize_llm_insights(payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(payload, dict):
        return fallback

    summary = str(payload.get("summary") or fallback["summary"]).strip()
    trajectory = str(payload.get("trajectory") or fallback["trajectory"]).strip().lower()
    if trajectory not in {"improving", "steady", "declining"}:
        trajectory = fallback["trajectory"]

    confidence_note = str(payload.get("confidence_note") or fallback["confidence_note"]).strip()

    key_weaknesses: list[dict[str, Any]] = []
    for item in payload.get("key_weaknesses") or []:
        if not isinstance(item, dict):
            continue
        actions = [str(x).strip() for x in (item.get("action_items") or []) if str(x).strip()]
        key_weaknesses.append(
            {
                "area": str(item.get("area") or "General Improvement").strip(),
                "impact_score": max(0.0, min(100.0, float(item.get("impact_score") or 50))),
                "rationale": str(item.get("rationale") or "").strip() or "Observed in recent sessions.",
                "action_items": actions[:5],
            }
        )

    key_strengths: list[dict[str, Any]] = []
    for item in payload.get("key_strengths") or []:
        if not isinstance(item, dict):
            continue
        key_strengths.append(
            {
                "area": str(item.get("area") or "General Strength").strip(),
                "rationale": str(item.get("rationale") or "").strip() or "Positive trend observed.",
            }
        )

    coaching_plan: list[dict[str, Any]] = []
    for item in payload.get("coaching_plan") or []:
        if not isinstance(item, dict):
            continue
        action_items = [str(x).strip() for x in (item.get("action_items") or []) if str(x).strip()]
        coaching_plan.append(
            {
                "phase": str(item.get("phase") or "Phase").strip(),
                "objective": str(item.get("objective") or "").strip() or "Improve interview performance",
                "action_items": action_items[:6],
                "success_metric": str(item.get("success_metric") or "Track score and weakness trend.").strip(),
            }
        )

    focus_radar: list[dict[str, Any]] = []
    for item in payload.get("focus_radar") or []:
        if not isinstance(item, dict):
            continue
        focus_radar.append(
            {
                "metric": str(item.get("metric") or "Metric").strip(),
                "score": max(0.0, min(100.0, float(item.get("score") or 0))),
            }
        )

    weakness_heatmap: list[dict[str, Any]] = []
    for item in payload.get("weakness_heatmap") or []:
        if not isinstance(item, dict):
            continue
        weakness_heatmap.append(
            {
                "area": str(item.get("area") or "Area").strip(),
                "technical": max(0.0, min(100.0, float(item.get("technical") or 0))),
                "communication": max(0.0, min(100.0, float(item.get("communication") or 0))),
                "consistency": max(0.0, min(100.0, float(item.get("consistency") or 0))),
            }
        )

    if not key_weaknesses:
        key_weaknesses = fallback["key_weaknesses"]
    if not key_strengths:
        key_strengths = fallback["key_strengths"]
    if not coaching_plan:
        coaching_plan = fallback["coaching_plan"]
    if not focus_radar:
        focus_radar = fallback["focus_radar"]
    if not weakness_heatmap:
        weakness_heatmap = fallback["weakness_heatmap"]

    return {
        "summary": summary,
        "trajectory": trajectory,
        "confidence_note": confidence_note,
        "key_weaknesses": key_weaknesses,
        "key_strengths": key_strengths,
        "coaching_plan": coaching_plan,
        "focus_radar": focus_radar,
        "weakness_heatmap": weakness_heatmap,
    }


async def _generate_llm_insights(context_payload: dict[str, Any], fallback: dict[str, Any]) -> dict[str, Any]:
    system_prompt = (
        "You are a senior interview performance analyst. "
        "Return strict JSON only with data that can be plotted directly in charts."
    )

    user_prompt = (
        "Analyze the user's full historical interview context and return a coaching-oriented result.\n"
        "Schema requirements (exact keys):\n"
        "{\n"
        '  "summary": "string",\n'
        '  "trajectory": "improving|steady|declining",\n'
        '  "confidence_note": "string",\n'
        '  "key_weaknesses": [{"area": "string", "impact_score": 0-100, "rationale": "string", "action_items": ["string"]}],\n'
        '  "key_strengths": [{"area": "string", "rationale": "string"}],\n'
        '  "coaching_plan": [{"phase": "string", "objective": "string", "action_items": ["string"], "success_metric": "string"}],\n'
        '  "focus_radar": [{"metric": "string", "score": 0-100}],\n'
        '  "weakness_heatmap": [{"area": "string", "technical": 0-100, "communication": 0-100, "consistency": 0-100}]\n'
        "}\n"
        "Keep it concise and actionable.\n\n"
        f"Context:\n{json.dumps(context_payload, ensure_ascii=True)}"
    )

    try:
        llm_payload = await invoke_llm_json(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            temperature=0.2,
        )
        return _sanitize_llm_insights(llm_payload, fallback)
    except Exception:
        logger.exception("LLM synthesis failed for results analytics; using deterministic fallback")
        return fallback


async def _compute_user_results_analysis(db: AsyncIOMotorDatabase, user_id: str) -> dict[str, Any]:
    interviews = await db["interviews"].find({"user_id": user_id}).sort("created_at", 1).to_list(length=1000)
    if not interviews:
        overview = {
            "total_sessions": 0,
            "completed_sessions": 0,
            "total_answers": 0,
            "avg_score": 0.0,
            "improvement_delta": 0.0,
            "contradiction_rate": 0.0,
        }
        empty_fallback = _default_llm_insights([], [], overview)
        return {
            "generated_at": datetime.now(timezone.utc),
            "overview": overview,
            "score_trend": [],
            "communication_trend": [],
            "weaknesses": [],
            "strengths": [],
            "role_breakdown": [],
            "session_snapshots": [],
            "llm_insights": empty_fallback,
        }

    interview_ids = [doc["_id"] for doc in interviews]
    responses = await db["responses"].find(
        {
            "user_id": user_id,
            "interview_id": {"$in": interview_ids},
        }
    ).sort("created_at", 1).to_list(length=20000)

    responses_by_session: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for response in responses:
        key = str(response.get("interview_id"))
        responses_by_session[key].append(response)

    score_trend: list[dict[str, Any]] = []
    communication_trend: list[dict[str, Any]] = []
    session_snapshots: list[dict[str, Any]] = []
    session_analysis_records: list[dict[str, Any]] = []
    weakness_terms_all: list[str] = []
    strength_terms_all: list[str] = []

    contradiction_total = 0
    scored_session_values: list[float] = []
    completed_sessions = 0
    role_aggregate: dict[str, dict[str, Any]] = defaultdict(lambda: {
        "sessions": 0,
        "scores": [],
        "confidence": [],
        "clarity": [],
        "nervousness": [],
    })

    weakness_to_scores: dict[str, list[float]] = defaultdict(list)
    weakness_to_examples: dict[str, list[str]] = defaultdict(list)
    strength_to_examples: dict[str, list[str]] = defaultdict(list)

    for interview in interviews:
        interview_id = str(interview["_id"])
        role = str(interview.get("role") or "Unknown")
        difficulty = str(interview.get("difficulty") or "unknown")
        status = str(interview.get("status") or "ongoing")
        created_at = interview.get("created_at")
        session_date = _session_date(created_at)

        if status == "completed":
            completed_sessions += 1

        session_responses = responses_by_session.get(interview_id, [])
        question_count = len(session_responses)

        raw_scores: list[float] = []
        contradictions = 0
        session_weaknesses: list[str] = []
        session_strengths: list[str] = []

        for response in session_responses:
            score_value = response.get("score")
            if isinstance(score_value, (int, float)):
                raw_scores.append(float(score_value) * 10.0)

            contradiction = response.get("contradiction_analysis") or {}
            if isinstance(contradiction, dict) and contradiction.get("contradiction"):
                contradictions += 1

            weaknesses = response.get("weaknesses") or []
            strengths = response.get("strengths") or []

            if isinstance(weaknesses, list):
                session_weaknesses.extend([str(item) for item in weaknesses if str(item).strip()])
            if isinstance(strengths, list):
                session_strengths.extend([str(item) for item in strengths if str(item).strip()])

        contradiction_total += contradictions
        session_avg = round(_mean(raw_scores), 2) if raw_scores else None
        if session_avg is not None:
            scored_session_values.append(session_avg)

        analysis = interview.get("session_analysis") or {}
        voice_summary = str(analysis.get("voice_summary") or "").strip()
        key_moments = analysis.get("key_moments") if isinstance(analysis.get("key_moments"), list) else []
        confidence = _to_percent(analysis.get("confidence"))
        clarity = _to_percent(analysis.get("clarity"))
        nervousness = _to_percent(analysis.get("nervousness"))
        posture = _to_percent(analysis.get("posture_score"))
        gaze = _to_percent(analysis.get("gaze_score"))
        fidgeting = _to_percent(analysis.get("fidgeting_score"))

        if session_avg is not None:
            score_trend.append(
                {
                    "session_id": interview_id,
                    "date": session_date,
                    "role": role,
                    "avg_score": session_avg,
                }
            )

        communication_trend.append(
            {
                "session_id": interview_id,
                "date": session_date,
                "confidence": confidence,
                "clarity": clarity,
                "nervousness": nervousness,
                "posture": posture,
                "gaze": gaze,
                "fidgeting": fidgeting,
            }
        )

        top_weaknesses = [item for item, _ in _top_terms(session_weaknesses, limit=3)]
        top_strengths = [item for item, _ in _top_terms(session_strengths, limit=3)]

        session_snapshots.append(
            {
                "session_id": interview_id,
                "role": role,
                "difficulty": difficulty,
                "status": status,
                "date": session_date,
                "question_count": question_count,
                "avg_score": session_avg,
                "contradictions": contradictions,
                "top_strengths": top_strengths,
                "top_weaknesses": top_weaknesses,
                "confidence": confidence,
                "clarity": clarity,
                "nervousness": nervousness,
                "dominant_emotion": analysis.get("dominant_emotion"),
            }
        )

        session_analysis_records.append(
            {
                "session_id": interview_id,
                "date": session_date,
                "role": role,
                "difficulty": difficulty,
                "status": status,
                "question_count": question_count,
                "avg_score": session_avg,
                "contradictions": contradictions,
                "dominant_emotion": analysis.get("dominant_emotion"),
                "duration_seconds": analysis.get("duration_seconds"),
                "confidence": confidence,
                "clarity": clarity,
                "nervousness": nervousness,
                "posture": posture,
                "gaze": gaze,
                "fidgeting": fidgeting,
                "voice_summary": voice_summary,
                "key_moments": key_moments,
                "top_strengths": top_strengths,
                "top_weaknesses": top_weaknesses,
            }
        )

        weakness_terms_all.extend(session_weaknesses)
        strength_terms_all.extend(session_strengths)

        role_bucket = role_aggregate[role]
        role_bucket["sessions"] += 1
        if session_avg is not None:
            role_bucket["scores"].append(session_avg)
        if confidence is not None:
            role_bucket["confidence"].append(confidence)
        if clarity is not None:
            role_bucket["clarity"].append(clarity)
        if nervousness is not None:
            role_bucket["nervousness"].append(nervousness)

        for weakness in session_weaknesses:
            key = " ".join(str(weakness).strip().lower().split())
            if not key:
                continue
            if session_avg is not None:
                weakness_to_scores[key].append(session_avg)
            if len(weakness_to_examples[key]) < 3:
                weakness_to_examples[key].append(str(weakness).strip())

        for strength in session_strengths:
            key = " ".join(str(strength).strip().lower().split())
            if not key:
                continue
            if len(strength_to_examples[key]) < 3:
                strength_to_examples[key].append(str(strength).strip())

    weakness_counter = Counter(" ".join(term.lower().split()) for term in weakness_terms_all if str(term).strip())
    strength_counter = Counter(" ".join(term.lower().split()) for term in strength_terms_all if str(term).strip())

    weaknesses: list[dict[str, Any]] = []
    for key, frequency in weakness_counter.most_common(12):
        examples = weakness_to_examples.get(key) or [key]
        display = examples[0]
        observed_scores = weakness_to_scores.get(key, [])
        avg_score_observed = round(_mean(observed_scores), 1) if observed_scores else 0.0
        impact_score = round(min(100.0, 25.0 + frequency * 8.5 + max(0.0, (65.0 - avg_score_observed)) * 0.8), 1)
        weaknesses.append(
            {
                "area": display,
                "frequency": int(frequency),
                "avg_score_when_observed": avg_score_observed,
                "impact_score": impact_score,
                "evidence": examples,
                "suggested_actions": [
                    f"Practice targeted prompts around: {display}",
                    "Use a tighter STAR-style structure with measurable outcomes",
                    "Run timed drills and review response clarity",
                ],
            }
        )

    strengths: list[dict[str, Any]] = []
    for key, frequency in strength_counter.most_common(12):
        examples = strength_to_examples.get(key) or [key]
        strengths.append(
            {
                "area": examples[0],
                "frequency": int(frequency),
                "evidence": examples,
            }
        )

    role_breakdown: list[dict[str, Any]] = []
    for role, payload in role_aggregate.items():
        role_breakdown.append(
            {
                "role": role,
                "sessions": int(payload["sessions"]),
                "avg_score": round(_mean([float(v) for v in payload["scores"]]), 1),
                "confidence": round(_mean([float(v) for v in payload["confidence"]]), 1) if payload["confidence"] else None,
                "clarity": round(_mean([float(v) for v in payload["clarity"]]), 1) if payload["clarity"] else None,
                "nervousness": round(_mean([float(v) for v in payload["nervousness"]]), 1) if payload["nervousness"] else None,
            }
        )
    role_breakdown.sort(key=lambda item: item["avg_score"], reverse=True)

    overall_avg_score = round(_mean([float(v) for v in scored_session_values]), 2)
    delta = 0.0
    if len(score_trend) >= 2:
        delta = round(score_trend[-1]["avg_score"] - score_trend[0]["avg_score"], 2)

    contradiction_rate = 0.0
    if responses:
        contradiction_rate = round((contradiction_total / max(1, len(responses))) * 100.0, 2)

    overview = {
        "total_sessions": len(interviews),
        "completed_sessions": completed_sessions,
        "total_answers": len(responses),
        "avg_score": overall_avg_score,
        "improvement_delta": delta,
        "contradiction_rate": contradiction_rate,
    }

    context_payload = {
        "overview": overview,
        "score_trend": score_trend,
        "communication_trend": communication_trend,
        "top_weaknesses": weaknesses[:10],
        "top_strengths": strengths[:10],
        "role_breakdown": role_breakdown,
        "session_snapshots": session_snapshots,
        "session_analysis_records": session_analysis_records,
    }

    fallback_insights = _default_llm_insights(weaknesses, strengths, overview)
    llm_insights = await _generate_llm_insights(context_payload, fallback_insights)

    return {
        "generated_at": datetime.now(timezone.utc),
        "overview": overview,
        "score_trend": score_trend,
        "communication_trend": communication_trend,
        "weaknesses": weaknesses,
        "strengths": strengths,
        "role_breakdown": role_breakdown,
        "session_snapshots": session_snapshots,
        "llm_insights": llm_insights,
    }


def _sanitize_cached_snapshot(doc: dict[str, Any]) -> dict[str, Any]:
    payload = dict(doc)
    payload.pop("_id", None)
    payload.pop("user_id", None)
    payload.pop("updated_at", None)
    return payload


async def get_user_results_analysis(
    db: AsyncIOMotorDatabase,
    user_id: str,
    *,
    force_refresh: bool = False,
) -> dict[str, Any]:
    collection = get_results_analysis_collection(db)

    if not force_refresh:
        cached = await collection.find_one({"user_id": user_id})
        if cached:
            logger.info("Returning cached results analysis", extra={"user_id": user_id})
            return _sanitize_cached_snapshot(cached)

    logger.info("Computing fresh results analysis", extra={"user_id": user_id, "force_refresh": force_refresh})
    fresh_analysis = await _compute_user_results_analysis(db, user_id)

    now = datetime.now(timezone.utc)
    snapshot_doc = {
        "user_id": user_id,
        "updated_at": now,
        **fresh_analysis,
    }
    await collection.update_one(
        {"user_id": user_id},
        {"$set": snapshot_doc},
        upsert=True,
    )

    return fresh_analysis


async def build_user_results_analysis(db: AsyncIOMotorDatabase, user_id: str) -> dict[str, Any]:
    # Backward-compatible wrapper used by existing imports.
    return await get_user_results_analysis(db, user_id, force_refresh=True)
