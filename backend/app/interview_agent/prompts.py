import json


def _normalize_persona(persona: str) -> str:
    return (persona or "").strip().lower().replace("-", "_").replace(" ", "_").replace("'", "")


def _is_devils_advocate(persona: str) -> bool:
    normalized = _normalize_persona(persona)
    return normalized in {"devils_advocate", "devil_advocate"}


def _persona_question_directive(persona: str) -> str:
    if _is_devils_advocate(persona):
        return (
            "Persona directive (Devil's Advocate): Use respectful pressure-testing. "
            "When uncertainty appears, ask pointed follow-ups that force the candidate to defend technical logic, "
            "state trade-offs, and show calm recovery steps. Avoid personal attacks or insults."
        )
    return "Persona directive: Follow the requested persona tone consistently."


def _persona_bank_directive(persona: str) -> str:
    if _is_devils_advocate(persona):
        return (
            "8) Because persona is Devil's Advocate, include periodic pressure-test prompts across the set: "
            "design defense, contradiction challenge, failure recovery, and technical trade-off justification.\n"
            "9) Keep pressure professional and role-relevant; challenge ideas, not the person.\n"
            "10) Ensure at least 1 pressure-test question every 4-5 questions after the introduction.\n"
        )
    return ""


def _persona_evaluation_directive(persona: str | None) -> str:
    if _is_devils_advocate(persona or ""):
        return (
            "Additional criteria for Devil's Advocate mode:\n"
            "- Evaluate emotional stability under pressure (calmness and composure).\n"
            "- Evaluate recovery speed when uncertain or corrected.\n"
            "- Evaluate ability to defend technical logic with concrete trade-offs and evidence.\n"
            "- Reward structured, confident recovery; penalize evasive or contradictory defense.\n"
        )
    return ""


def _format_history(history: list[dict]) -> str:
    if not history:
        return "No previous interview interactions yet."

    chunks: list[str] = []
    for index, item in enumerate(history, start=1):
        chunks.append(
            (
                f"Interaction {index}:\n"
                f"Question: {item.get('question', '')}\n"
                f"Answer: {item.get('answer', '')}\n"
                f"Score: {item.get('score', 'N/A')}\n"
                f"Feedback: {item.get('feedback', '')}\n"
            )
        )
    return "\n".join(chunks)


QUESTION_SYSTEM_PROMPT = (
    "You are a professional AI interviewer. "
    "Generate one adaptive interview question at a time. "
    "Always respond with strict JSON and no markdown."
)

EVALUATION_SYSTEM_PROMPT = (
    "You are an expert interviewer evaluating candidate answers. "
    "Evaluate for correctness, depth, communication clarity, and relevance. "
    "Always respond with strict JSON and no markdown."
)


def build_question_prompt(
    *,
    role: str,
    difficulty: str,
    persona: str,
    resume: dict,
    history: list[dict],
    next_strategy: str,
    current_turn: int,
    max_questions: int,
    variation_token: str,
) -> str:
    schema = {
        "question": "string",
        "difficulty": "string",
    }

    resume_snapshot = {
        "skills": resume.get("skills", []),
        "projects": resume.get("projects", []),
        "raw_text": resume.get("raw_text", "")[:3000],
    }
    persona_directive = _persona_question_directive(persona)

    # For the very first question generation (no history yet), force an introduction question
    if current_turn == 1 and not history:
        return (
            "Generate the first interview question.\n"
            "CRITICAL RULE: The first question MUST be a variant of 'Tell me about yourself'. "
            "For example: 'Tell me about yourself and your background.' or "
            "'Please introduce yourself and walk me through your experience.' "
            "Keep it warm, natural and conversational. Match the persona tone.\n\n"
            f"Role: {role}\n"
            f"Persona: {persona}\n"
            f"{persona_directive}\n"
            f"Variation Token: {variation_token}\n\n"
            f"Return JSON only in this shape: {json.dumps(schema)}"
        )

    return (
        "Generate the next interview question.\n"
        "Constraints:\n"
        "1) Respect persona tone (mentor, aggressive, friendly, etc.).\n"
        "2) Match role and requested difficulty unless strategy says otherwise.\n"
        "3) Use resume context when available.\n"
        "4) Avoid repeating the same topic as recent questions.\n"
        "5) Keep the question concise but deep enough for evaluation.\n\n"
        "6) Use the variation token to diversify wording and focus across sessions.\n\n"
        f"{persona_directive}\n\n"
        f"Role: {role}\n"
        f"Requested Difficulty: {difficulty}\n"
        f"Persona: {persona}\n"
        f"Current Strategy: {next_strategy}\n"
        f"Turn: {current_turn}/{max_questions}\n"
        f"Variation Token: {variation_token}\n"
        f"Resume Context: {json.dumps(resume_snapshot)}\n"
        f"Recent History:\n{_format_history(history)}\n\n"
        f"Return JSON only in this shape: {json.dumps(schema)}"
    )


def build_question_bank_prompt(
    *,
    role: str,
    difficulty: str,
    persona: str,
    resume: dict,
    max_questions: int,
    variation_token: str,
) -> str:
    resume_snapshot = {
        "skills": resume.get("skills", []),
        "projects": resume.get("projects", []),
        "raw_text": resume.get("raw_text", "")[:3000],
    }

    schema = {
        "questions": ["string — exactly " + str(max_questions) + " questions"],
    }
    persona_bank_directive = _persona_bank_directive(persona)

    return (
        f"Generate exactly {max_questions} interview questions as a JSON array.\n"
        "CRITICAL RULES:\n"
        "1) The FIRST question MUST be a variant of 'Tell me about yourself and your background.'\n"
        "2) Every question must be UNIQUE — no repetition of topic or phrasing.\n"
        "3) Questions must progress in difficulty: start easy, build to medium, then hard.\n"
        "4) Distribute across categories:\n"
        "   - Questions 1-3: Introduction & behavioral (soft skills, teamwork, motivation)\n"
        "   - Questions 4-10: Core technical (fundamentals, architecture, tools)\n"
        "   - Questions 11-18: Deep technical + situational (system design, problem-solving, debugging)\n"
        "   - Questions 19-25: Advanced + project-based (past projects, trade-offs, leadership)\n"
        "5) Use the resume context to personalize questions about the candidate's actual skills and projects.\n"
        "6) Match the interviewer persona tone throughout.\n"
        "7) Each question should be concise but deep enough for a meaningful answer.\n\n"
        f"{persona_bank_directive}"
        f"Role: {role}\n"
        f"Base Difficulty: {difficulty}\n"
        f"Persona: {persona}\n"
        f"Variation Token: {variation_token}\n"
        f"Resume Context: {json.dumps(resume_snapshot)}\n\n"
        f"Return JSON only in this shape: {json.dumps(schema)}"
    )


QUESTION_BANK_SYSTEM_PROMPT = (
    "You are a professional AI interviewer preparing a complete question set for an interview session. "
    "Generate all questions upfront as a structured JSON array. "
    "Always respond with strict JSON and no markdown."
)


def build_evaluation_prompt(
    *,
    role: str,
    difficulty: str,
    persona: str | None,
    question: str,
    answer: str,
    history: list[dict],
) -> str:
    schema = {
        "score": "integer from 1 to 10",
        "feedback": "string",
        "strengths": ["string"],
        "weaknesses": ["string"],
    }
    persona_evaluation_directive = _persona_evaluation_directive(persona)

    return (
        "Evaluate the answer to the interview question.\n"
        "Scoring guidance:\n"
        "- 1 to 4: weak understanding / unclear answer\n"
        "- 5 to 8: acceptable to strong answer\n"
        "- 9 to 10: excellent depth and clarity\n"
        "Evaluation must be objective and role-aware.\n\n"
        f"{persona_evaluation_directive}"
        f"Role: {role}\n"
        f"Difficulty: {difficulty}\n"
        f"Persona: {persona or 'neutral'}\n"
        f"Question: {question}\n"
        f"Answer: {answer}\n"
        f"Recent History:\n{_format_history(history)}\n\n"
        f"Return JSON only in this shape: {json.dumps(schema)}"
    )
