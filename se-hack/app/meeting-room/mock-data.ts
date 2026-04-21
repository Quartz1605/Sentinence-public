import { Participant, Scenario } from "./types";

export const candidateId = "candidate";

export const initialScenario: Scenario = {
  title: "Sprint Crisis Meeting",
  description:
    "A key client demo is in 36 hours. The text-to-speech review engine is unstable and release confidence is dropping.",
  problemStatement:
    "Your text-to-speech API is failing intermittently under load. Coordinate triage across backend, infra, QA, and product while preserving delivery goals.",
  durationSec: 14 * 60,
};

export const initialParticipants: Participant[] = [
  {
    id: candidateId,
    name: "You",
    role: "Candidate - Full Stack Engineer",
    personality: "Calm and analytical",
    isAi: false,
    isMuted: false,
    status: "idle",
    speakingTimeSec: 0,
  },
  {
    id: "ai-backend",
    name: "Rahul",
    role: "Backend Developer",
    personality: "Detail-oriented and cautious",
    isAi: true,
    isMuted: false,
    status: "idle",
    speakingTimeSec: 0,
  },
  {
    id: "ai-devops",
    name: "Maya",
    role: "DevOps Engineer",
    personality: "Fast, decisive, systems-first",
    isAi: true,
    isMuted: false,
    status: "idle",
    speakingTimeSec: 0,
  },
  {
    id: "ai-product",
    name: "Arjun",
    role: "Product Manager",
    personality: "Outcome-focused and assertive",
    isAi: true,
    isMuted: false,
    status: "idle",
    speakingTimeSec: 0,
  },
  {
    id: "ai-qa",
    name: "Nina",
    role: "QA Lead",
    personality: "Methodical and risk-aware",
    isAi: true,
    isMuted: false,
    status: "idle",
    speakingTimeSec: 0,
  },
];

export const aiChatSeeds: string[] = [
  "I can reproduce this locally only when concurrent sessions exceed 40.",
  "Infra metrics show memory spikes right before retries explode.",
  "Can someone confirm if rollback keeps candidate transcripts intact?",
  "I need help validating this against our mobile clients.",
  "If we trim features for now, we can stabilize the core path.",
  "I am seeing failed token refresh events in the latest logs.",
  "Let us split: one owner for root cause, one for mitigation.",
  "We should freeze non-critical merges for the next two hours.",
  "I can own rapid regression checks once patch build is ready.",
  "Can we align on one incident channel and update cadence?",
];

export const helpSignals: string[] = [
  "I need help verifying a risky assumption.",
  "Can someone pair with me on this test gap?",
  "I am blocked by missing API contract updates.",
  "Need quick support to validate rollback safety.",
];
