import logging

from langgraph.graph import END, START, StateGraph

from app.interview_agent.nodes import answer_evaluator_node, decision_node, question_generator_node
from app.interview_agent.schemas import InterviewAgentState


logger = logging.getLogger(__name__)


def _route_from_start(state: InterviewAgentState) -> str:
    stage = state.get("stage", "generate_first_question")
    logger.info("Interview graph routing from START", extra={"stage": stage})
    if stage == "evaluate_and_generate_next":
        return "answer_evaluator"
    return "question_generator"


def build_interview_agent_graph():
    logger.info("Building interview agent graph")
    graph_builder = StateGraph(InterviewAgentState)

    graph_builder.add_node("question_generator", question_generator_node)
    graph_builder.add_node("answer_evaluator", answer_evaluator_node)
    graph_builder.add_node("decision", decision_node)

    graph_builder.add_conditional_edges(
        START,
        _route_from_start,
        {
            "question_generator": "question_generator",
            "answer_evaluator": "answer_evaluator",
        },
    )
    graph_builder.add_edge("answer_evaluator", "decision")
    graph_builder.add_edge("decision", "question_generator")
    graph_builder.add_edge("question_generator", END)

    compiled = graph_builder.compile()
    logger.info("Interview agent graph compiled")
    return compiled


interview_agent_graph = build_interview_agent_graph()
