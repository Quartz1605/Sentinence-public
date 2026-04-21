from typing import Any, TypedDict
from typing_extensions import NotRequired


class InterviewInteraction(TypedDict):
    question: str
    answer: str
    score: int
    feedback: str
    strengths: list[str]
    weaknesses: list[str]


class ResumeContext(TypedDict):
    skills: list[str]
    projects: list[str]
    raw_text: str


class AnswerEvaluation(TypedDict):
    score: int
    feedback: str
    strengths: list[str]
    weaknesses: list[str]


class InterviewAgentState(TypedDict):
    stage: str
    variation_token: str
    role: str
    difficulty: str
    persona: str
    resume: ResumeContext
    history: list[InterviewInteraction]
    max_questions: int
    current_turn: int
    last_question: NotRequired[str]
    last_answer: NotRequired[str]
    last_score: NotRequired[int]
    next_strategy: NotRequired[str]
    evaluation: NotRequired[AnswerEvaluation]
    question: NotRequired[str]
    generated_difficulty: NotRequired[str]


QuestionPayload = dict[str, Any]
EvaluationPayload = dict[str, Any]
