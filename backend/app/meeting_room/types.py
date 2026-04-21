"""
Shared data types for the meeting room module.
"""

from pydantic import BaseModel


class ParticipantConfig(BaseModel):
    id: str
    name: str
    role: str
    personality: str


class Scenario(BaseModel):
    id: str
    title: str
    description: str
    problem_statement: str
    duration_sec: int
    participants: list[ParticipantConfig]
