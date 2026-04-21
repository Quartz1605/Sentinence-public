"""
Scenario manager for team-fit meeting simulations.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ScenarioOption:
    id: str
    title: str
    description: str
    focus: str
    estimated_duration_sec: int


DEFAULT_PARTICIPANTS: list[dict[str, str]] = [
    {"name": "Aman", "role": "Backend Engineer"},
    {"name": "Riya", "role": "Product Manager"},
    {"name": "Karan", "role": "Frontend Developer"},
]


SCENARIOS: dict[str, ScenarioOption] = {
    "production-crisis": ScenarioOption(
        id="production-crisis",
        title="Production Crisis Meeting",
        description="Backend system has crashed. Align quickly on triage, ownership, and customer impact updates.",
        focus="Debugging, urgency, accountability",
        estimated_duration_sec=12 * 60,
    ),
    "pre-launch": ScenarioOption(
        id="pre-launch",
        title="Pre-Launch Meeting",
        description="Major feature launch is scheduled for tomorrow. Team must lock rollout plan and risks.",
        focus="Planning, ownership, risks",
        estimated_duration_sec=10 * 60,
    ),
    "custom-scenario": ScenarioOption(
        id="custom-scenario",
        title="Custom Scenario",
        description="Pick your own team challenge like conflict, missed deadlines, or redesign alignment.",
        focus="Adaptability, communication, leadership",
        estimated_duration_sec=10 * 60,
    ),
}


def list_scenarios() -> list[dict[str, str]]:
    return [
        {
            "id": scenario.id,
            "title": scenario.title,
            "description": scenario.description,
        }
        for scenario in SCENARIOS.values()
    ]


def get_scenario_option(scenario_id: str) -> ScenarioOption:
    scenario = SCENARIOS.get(scenario_id)
    if scenario:
        return scenario
    return SCENARIOS["custom-scenario"]


def build_scenario_payload(scenario_id: str, custom_context: str | None = None) -> dict[str, str | int]:
    scenario = get_scenario_option(scenario_id)
    context = (custom_context or "").strip()

    if scenario.id == "custom-scenario" and context:
        description = f"{scenario.description} Context: {context}"
    else:
        description = scenario.description

    return {
        "id": scenario.id,
        "title": scenario.title,
        "description": description,
        "focus": scenario.focus,
        "estimated_duration_sec": scenario.estimated_duration_sec,
    }


def build_participants() -> list[dict[str, str]]:
    return [dict(item) for item in DEFAULT_PARTICIPANTS]


def build_question_flow(scenario_id: str, custom_context: str | None = None) -> list[dict[str, str]]:
    context = (custom_context or "").strip()

    if scenario_id == "production-crisis":
        return [
            {
                "speaker": "Riya",
                "question": "Why did the backend crash and what steps are you taking to fix it in the next 30 minutes?",
                "intent": "problem_solving",
            },
            {
                "speaker": "Aman",
                "question": "Which logs and service health signals will you check first to confirm root cause?",
                "intent": "technical_reasoning",
            },
            {
                "speaker": "Karan",
                "question": "What temporary fallback can frontend use so users can continue core flows while backend is unstable?",
                "intent": "cross_team_collaboration",
            },
            {
                "speaker": "Riya",
                "question": "Who owns mitigation, who owns root-cause, and when will you share the next stakeholder update?",
                "intent": "ownership",
            },
            {
                "speaker": "Aman",
                "question": "After recovery, what guardrails will you add to prevent this exact incident from repeating?",
                "intent": "prevention",
            },
        ]

    if scenario_id == "pre-launch":
        return [
            {
                "speaker": "Riya",
                "question": "Launch is tomorrow. What must be true before we ship and how will you validate readiness?",
                "intent": "planning",
            },
            {
                "speaker": "Aman",
                "question": "Which backend risks are still unresolved, and what mitigation path can be completed today?",
                "intent": "risk_management",
            },
            {
                "speaker": "Karan",
                "question": "How should we split ownership for launch-day monitoring and rollback decisions?",
                "intent": "ownership",
            },
            {
                "speaker": "Riya",
                "question": "If one critical bug appears 2 hours before launch, what is your go or no-go framework?",
                "intent": "decision_making",
            },
            {
                "speaker": "Aman",
                "question": "What post-launch checkpoints will you run in the first 24 hours to ensure stability?",
                "intent": "execution",
            },
        ]

    custom_topic = context or "a team conflict causing repeated missed deadlines"
    return [
        {
            "speaker": "Riya",
            "question": f"We are dealing with {custom_topic}. How would you frame the problem to align everyone?",
            "intent": "problem_framing",
        },
        {
            "speaker": "Aman",
            "question": "What concrete actions would you take in the next sprint to unblock delivery?",
            "intent": "execution",
        },
        {
            "speaker": "Karan",
            "question": "How will you handle disagreement between teammates while keeping progress measurable?",
            "intent": "conflict_resolution",
        },
        {
            "speaker": "Riya",
            "question": "How will you communicate trade-offs and accountability to leadership?",
            "intent": "stakeholder_communication",
        },
        {
            "speaker": "Aman",
            "question": "What signals will prove your approach is working after one week?",
            "intent": "outcome_orientation",
        },
    ]
