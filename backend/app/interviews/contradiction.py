import json
import os
import httpx
import logging

logger = logging.getLogger(__name__)

OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

CONTRADICTION_PROMPT_TEMPLATE = """You are an intelligent interview analysis system.

Your task is to detect contradictions between a user's past statements and their latest statement.

----------------------------
CONTEXT
----------------------------

Past statements:
{memory}

New statement:
"{current_input}"

----------------------------
INSTRUCTIONS
----------------------------

1. Carefully analyze the meaning of the past statements and the new statement.
2. Identify if there is any contradiction in:
   - skills or expertise
   - experience level
   - opinions or preferences
3. Consider semantic meaning, not just exact words.
4. Ignore minor wording differences unless meaning changes.
5. Only flag contradiction if there is a clear logical inconsistency.

----------------------------
OUTPUT FORMAT (STRICT JSON)
----------------------------

{{
  "contradiction": true/false,
  "confidence": 0.0-1.0,
  "topic": "string (e.g., Python, teamwork)",
  "previous_claim": "string",
  "current_claim": "string",
  "explanation": "short reasoning",
  "severity": "low | medium | high"
}}

----------------------------
EXAMPLES
----------------------------

Example 1:
Past: "I have strong experience in Python"
New: "I am not familiar with Python"

→ contradiction: true

Example 2:
Past: "I enjoy teamwork"
New: "I prefer working alone sometimes"

→ contradiction: false

----------------------------
IMPORTANT
----------------------------

- Be precise and conservative
- Avoid false positives
- Base your answer on meaning, not keywords
"""

async def detect_contradiction(memory: str, current_input: str) -> dict | None:
    openrouter_api_key = os.environ.get("OPENROUTER_API_KEY")
    if not openrouter_api_key:
        logger.warning("OPENROUTER_API_KEY not set. Cannot run contradiction detection.")
        return None

    prompt = CONTRADICTION_PROMPT_TEMPLATE.format(
        memory=memory if memory else "No past statements yet.",
        current_input=current_input
    )

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                "https://openrouter.ai/api/v1/chat/completions",
                headers={
                    "Authorization": f"Bearer {openrouter_api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "model": "google/gemini-2.0-flash-lite-001",
                    "messages": [
                        {"role": "user", "content": prompt}
                    ],
                    "response_format": {"type": "json_object"}
                },
                timeout=15.0
            )
            response.raise_for_status()
            data = response.json()
            content = data["choices"][0]["message"]["content"]
            
            # Clean up the response in case it contains markdown code blocks
            content = content.strip()
            if content.startswith("```json"):
                content = content[7:]
            if content.endswith("```"):
                content = content[:-3]
                
            return json.loads(content.strip())
    except Exception as e:
        logger.error(f"Error detecting contradiction: {e}")
        return None
