"""
Scenario definitions and participant configurations for meeting simulations.
"""

from app.meeting_room.types import Scenario, ParticipantConfig


SCENARIOS: dict[str, Scenario] = {
    "crisis-36h": Scenario(
        id="crisis-36h",
        title="Sprint Crisis Meeting",
        description=(
            "A key client demo is in 36 hours. The text-to-speech review "
            "engine is unstable and release confidence is dropping."
        ),
        problem_statement=(
            "Your text-to-speech API is failing intermittently under load. "
            "Coordinate triage across backend, infra, QA, and product "
            "while preserving delivery goals."
        ),
        duration_sec=14 * 60,
        participants=[
            ParticipantConfig(
                id="ai-backend",
                name="Rahul",
                role="Backend Developer",
                personality="Detail-oriented and cautious",
            ),
            ParticipantConfig(
                id="ai-devops",
                name="Maya",
                role="DevOps Engineer",
                personality="Fast, decisive, systems-first",
            ),
            ParticipantConfig(
                id="ai-product",
                name="Arjun",
                role="Product Manager",
                personality="Outcome-focused and assertive",
            ),
            ParticipantConfig(
                id="ai-qa",
                name="Nina",
                role="QA Lead",
                personality="Methodical and risk-aware",
            ),
        ],
    ),
}

DEFAULT_SCENARIO_ID = "crisis-36h"
