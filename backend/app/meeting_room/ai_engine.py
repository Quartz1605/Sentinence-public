"""
AI engine for meeting room — generates in-character participant replies
and final session reports via OpenRouter.

Uses the same OpenRouter + AsyncOpenAI pattern as app.voice.llm_engine.
"""

import os
import json
import logging
from openai import AsyncOpenAI

logger = logging.getLogger(__name__)


def _get_client() -> AsyncOpenAI:
    api_key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPENROUTER_KEY")
    return AsyncOpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=api_key,
    )


MODEL = "google/gemini-2.0-flash-lite-001"


# ── AI participant reply ─────────────────────────────────────────────

async def get_ai_reply(
    *,
    responder_name: str,
    responder_role: str,
    responder_personality: str,
    scenario_prompt: str,
    recent_messages: list[dict],
) -> str:
    """
    Generate a single in-character reply from an AI participant.

    Parameters
    ----------
    responder_name : e.g. "Rahul"
    responder_role : e.g. "Backend Developer"
    responder_personality : e.g. "Detail-oriented and cautious"
    scenario_prompt : the meeting's problem statement
    recent_messages : last 10 chat messages [{sender_name, text}]

    Returns
    -------
    str : The AI's reply text (1-3 sentences)
    """
    system_prompt = (
        f"You are {responder_name}, a {responder_role} in a team meeting. "
        f"Your personality: {responder_personality}. "
        f"The scenario: {scenario_prompt}\n\n"
        "Rules:\n"
        "- Stay strictly in character.\n"
        "- Reply in 1-3 concise sentences.\n"
        "- React naturally to what was just said.\n"
        "- Occasionally ask clarifying questions or raise concerns relevant to your role.\n"
        "- Never break character or mention that you are an AI.\n"
        "- Do NOT use markdown formatting. Plain text only.\n"
    )

    conversation_context = ""
    for msg in recent_messages[-10:]:
        name = msg.get("sender_name", "Unknown")
        text = msg.get("text", "")
        conversation_context += f"{name}: {text}\n"

    user_prompt = (
        f"Meeting chat so far:\n{conversation_context}\n"
        f"Now reply as {responder_name}:"
    )

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.7,
            max_tokens=150,
        )
        content = response.choices[0].message.content.strip()
        # Remove any accidental name prefix the LLM might add
        if content.startswith(f"{responder_name}:"):
            content = content[len(f"{responder_name}:"):].strip()
        return content
    except Exception as e:
        logger.error(f"[AI Engine] Error generating reply for {responder_name}: {e}")
        return f"I agree, let's keep pushing forward on this."


# ── Final report generation ──────────────────────────────────────────

async def generate_meeting_report(
    *,
    scenario_title: str,
    scenario_prompt: str,
    messages: list[dict],
    final_metrics: dict,
    interruptions: int,
) -> dict:
    """
    Generate a comprehensive post-meeting feedback report.

    Returns dict with: overall_score, strengths[], weaknesses[], summary
    """
    candidate_messages = [
        m for m in messages
        if m.get("sender_id") == "candidate"
    ]

    candidate_transcript = "\n".join(
        [f"- {m.get('text', '')}" for m in candidate_messages]
    ) or "No messages from candidate."

    all_transcript = "\n".join(
        [f"{m.get('sender_name', '?')}: {m.get('text', '')}" for m in messages[-30:]]
    )

    system_prompt = (
        "You are a meeting performance evaluator for interview preparation software. "
        "You receive a full meeting transcript, the candidate's individual messages, "
        "and their behavioral metrics. Generate a precise performance report.\n\n"
        "Return ONLY a JSON object with these exact keys:\n"
        '  "overall_score": integer 1-100,\n'
        '  "strengths": array of 2-4 specific strength strings,\n'
        '  "weaknesses": array of 2-4 specific weakness strings,\n'
        '  "summary": string, 2-3 sentences overall assessment\n\n'
        "Do not wrap in markdown. Output raw JSON only."
    )

    user_prompt = json.dumps({
        "scenario": scenario_title,
        "problem_statement": scenario_prompt,
        "candidate_messages": candidate_transcript,
        "full_transcript_last_30": all_transcript,
        "final_metrics": final_metrics,
        "interruptions": interruptions,
        "total_candidate_messages": len(candidate_messages),
        "total_messages": len(messages),
    })

    try:
        client = _get_client()
        response = await client.chat.completions.create(
            model=MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        logger.error(f"[AI Engine] Error generating meeting report: {e}")
        return {
            "overall_score": 65,
            "strengths": ["Participated in the meeting discussion."],
            "weaknesses": ["Could not fully evaluate due to a processing error."],
            "summary": "The session completed but automated evaluation encountered an error.",
        }
