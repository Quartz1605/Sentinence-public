import logging

from fastapi import HTTPException, status

from app.interview_agent.llm import invoke_llm_json
from app.interview_agent.prompts import (
    EVALUATION_SYSTEM_PROMPT,
    QUESTION_SYSTEM_PROMPT,
    build_evaluation_prompt,
    build_question_prompt,
)
from app.interview_agent.schemas import AnswerEvaluation, InterviewAgentState


logger = logging.getLogger(__name__)


async def question_generator_node(state: InterviewAgentState) -> dict:
    logger.info(
        "Question generator node started",
        extra={
            "role": state.get("role"),
            "difficulty": state.get("difficulty"),
            "persona": state.get("persona"),
            "turn": state.get("current_turn"),
            "max_questions": state.get("max_questions"),
        },
    )
    payload = await invoke_llm_json(
        system_prompt=QUESTION_SYSTEM_PROMPT,
        user_prompt=build_question_prompt(
            role=state["role"],
            difficulty=state["difficulty"],
            persona=state["persona"],
            resume=state["resume"],
            history=state["history"],
            next_strategy=state.get("next_strategy", "normal progression"),
            current_turn=state["current_turn"],
            max_questions=state["max_questions"],
            variation_token=state["variation_token"],
        ),
        temperature=0.65,
    )

    question = payload.get("question")
    generated_difficulty = payload.get("difficulty") or state["difficulty"]

    if not isinstance(question, str) or not question.strip():
        logger.error("Question generator returned invalid question payload", extra={"payload": payload})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Question generator returned invalid question",
        )

    logger.info(
        "Question generator node completed",
        extra={
            "generated_difficulty": str(generated_difficulty),
            "question_length": len(question.strip()),
        },
    )

    return {
        "question": question.strip(),
        "generated_difficulty": str(generated_difficulty),
    }


async def answer_evaluator_node(state: InterviewAgentState) -> dict:
    question = state.get("last_question")
    answer = state.get("last_answer")

    logger.info(
        "Answer evaluator node started",
        extra={
            "role": state.get("role"),
            "difficulty": state.get("difficulty"),
            "question_length": len(question) if isinstance(question, str) else 0,
            "answer_length": len(answer) if isinstance(answer, str) else 0,
        },
    )

    if not question or not answer:
        logger.error("Answer evaluator missing question or answer")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing question or answer for evaluation",
        )

    payload = await invoke_llm_json(
        system_prompt=EVALUATION_SYSTEM_PROMPT,
        user_prompt=build_evaluation_prompt(
            role=state["role"],
            difficulty=state["difficulty"],
            persona=state.get("persona"),
            question=question,
            answer=answer,
            history=state["history"],
        ),
        temperature=0.15,
    )

    score_raw = payload.get("score", 5)
    try:
        score = int(score_raw)
    except (TypeError, ValueError):
        logger.warning("Evaluation score was non-numeric; defaulting to 5", extra={"score_raw": score_raw})
        score = 5
    score = max(1, min(10, score))

    strengths = payload.get("strengths")
    weaknesses = payload.get("weaknesses")

    evaluation: AnswerEvaluation = {
        "score": score,
        "feedback": str(payload.get("feedback", "No feedback provided")).strip(),
        "strengths": [str(item) for item in strengths] if isinstance(strengths, list) else [],
        "weaknesses": [str(item) for item in weaknesses] if isinstance(weaknesses, list) else [],
    }

    logger.info(
        "Answer evaluator node completed",
        extra={
            "score": score,
            "strength_count": len(evaluation["strengths"]),
            "weakness_count": len(evaluation["weaknesses"]),
        },
    )

    return {
        "evaluation": evaluation,
        "last_score": score,
    }


def decision_node(state: InterviewAgentState) -> dict:
    score = int(state.get("last_score", 5))
    logger.info("Decision node evaluating next strategy", extra={"score": score, "prior_difficulty": state.get("difficulty")})

    if score < 5:
        logger.info("Decision branch selected: easier follow-up", extra={"score": score})
        return {
            "next_strategy": "Ask an easier question and reinforce fundamentals.",
            "difficulty": "easy",
        }

    if score <= 8:
        logger.info("Decision branch selected: normal progression", extra={"score": score})
        return {
            "next_strategy": "Normal progression with balanced depth.",
            "difficulty": state["difficulty"],
        }

    logger.info("Decision branch selected: harder follow-up", extra={"score": score})
    return {
        "next_strategy": "Ask a deeper follow-up question with higher complexity.",
        "difficulty": "hard",
    }
