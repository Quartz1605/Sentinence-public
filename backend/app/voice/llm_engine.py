import os
import json
from openai import AsyncOpenAI
import logging

logger = logging.getLogger(__name__)

OPENROUTER_KEY = os.getenv("OPENROUTER_KEY")
if not OPENROUTER_KEY:
    OPENROUTER_KEY = os.getenv("OPENROUTER_API_KEY")

client = AsyncOpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=OPENROUTER_KEY,
)

async def get_periodic_insights(
    text: str,
    words_timestamps: list,
    emotion_context: dict | None = None,
) -> dict:
    """
    Analyze a ~10s transcript chunk. Optionally receives real-time
    emotion context from the video analysis pipeline for multi-modal
    correlation.
    """
    if not text or len(text.strip()) < 2:
        return {}

    if not OPENROUTER_KEY:
        logger.warning("Missing OPENROUTER_KEY/OPENROUTER_API_KEY; skipping periodic insights")
        return {}

    # Build the system prompt — inject emotion awareness if data is available
    system_prompt = (
        "You are a fast semantic voice analysis NLP layer. The input is a 10s transcript chunk with timestamps. "
        "Analyze behavioral aspects like stress, hesitation, and confidence based purely on the text and filler words. "
    )

    if emotion_context:
        system_prompt += (
            "You also receive real-time facial emotion data from video analysis. "
            "Correlate speech hesitation patterns with the detected facial emotion for deeper multi-modal analysis. "
            f"Current facial emotion: {emotion_context.get('emotion', 'unknown')} "
            f"(video confidence: {emotion_context.get('confidence', 0):.2f}). "
        )
        breakdown = emotion_context.get("emotion_breakdown", {})
        if breakdown:
            top_emotions = sorted(breakdown.items(), key=lambda x: x[1], reverse=True)[:3]
            top_str = ", ".join([f"{e}: {v:.1%}" for e, v in top_emotions])
            system_prompt += f"Top emotion breakdown: {top_str}. "

    system_prompt += (
        "Return ONLY a JSON dictionary with these keys: "
        "\"insight\" (string: short description of stress/hesitation, correlate with facial emotion if available), "
        "\"time_range\" (array of two floats: start and end time of the insight event), "
        "\"words\" (array of strings: specific words indicating this insight), "
        "\"confidence_score\" (float 0-1), "
        "\"stress_level\" (string: 'high', 'medium', 'low'). "
        "Do not wrap in markdown, just output raw JSON."
    )

    try:
        user_payload = {"text": text, "words_data": words_timestamps}
        if emotion_context:
            user_payload["emotion_context"] = emotion_context

        response = await client.chat.completions.create(
            model="google/gemini-2.0-flash-lite-001",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            temperature=0.1,
            max_tokens=250,
        )
        
        content = response.choices[0].message.content.strip()
        print(f"[LLM] Periodic NLP Raw output: {content}")
        
        content = content.replace("```json", "").replace("```", "").strip()
        result = json.loads(content)
        return result
    except Exception as e:
        print(f"[LLM] Error fetching periodic insights: {e}")
        return {}

async def get_final_summary(
    full_text: str,
    all_insights: list,
    emotion_timeline: list | None = None,
) -> dict:
    """
    Generate a post-session summary. Optionally receives an aggregated
    emotion timeline from video analysis for multi-modal final analysis.
    """
    if not full_text:
        return {"overall_summary": "No audio was recorded.", "key_moments": []}

    if not OPENROUTER_KEY:
        logger.warning("Missing OPENROUTER_KEY/OPENROUTER_API_KEY; using fallback final summary")
        return {
            "overall_summary": "Session captured but LLM summary service is unavailable. Detailed timeline data was still saved.",
            "key_moments": [],
        }

    system_prompt = (
        "You are a post-session interview analyzer. You receive the full transcript with embedded insights, generated periodically. "
    )

    if emotion_timeline and len(emotion_timeline) > 0:
        system_prompt += (
            "You also receive a timeline array of the candidate's facial emotions and visual behavior detected by video analysis. "
            "The visual_behavior dictionary contains posture, gaze, and fidgeting data. "
            "The 'time_window' key exactly marks the MM:SS the emotion was captured. "
            "You MUST integrate the video's key emotional moment timestamps with the audio key moments. "
            "You MUST actively include explicit visual observations (e.g. fidgeting frequency, posture slumping, eye contact patterns) seamlessly into the key moments analysis. "
        )

    system_prompt += (
        "Generate a cohesive performance summary and highly specific timeline-based behavioral key moments. "
        "Return ONLY a JSON dictionary with these EXACT keys: "
        "\"overall_summary\" (string: 2-3 sentences. MUST explicitly mention an overarching summary of their video presence, like their posture, fidgeting, and emotion alongside their speaking behavior), "
        "\"key_moments\" (array of objects with { time: string (You must copy the 'time_str' or 'time_window' string exactly, e.g. '0:12-0:18'), description: string (Detailed cross-referenced insight) }). "
        "Do not wrap in markdown."
    )

    try:
        user_payload = {"full_text": full_text, "session_insights": all_insights}
        if emotion_timeline:
            user_payload["emotion_timeline"] = emotion_timeline

        response = await client.chat.completions.create(
            model="google/gemini-2.0-flash-lite-001",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": json.dumps(user_payload)},
            ],
            temperature=0.2,
            max_tokens=400,
        )
        content = response.choices[0].message.content.strip()
        content = content.replace("```json", "").replace("```", "").strip()
        return json.loads(content)
    except Exception as e:
        print(f"[LLM] Error fetching final summary: {e}")
        return {}
