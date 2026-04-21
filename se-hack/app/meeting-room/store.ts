import { create } from "zustand";

import { aiChatSeeds, candidateId, helpSignals, initialParticipants, initialScenario } from "./mock-data";
import { AnalyticsSnapshot, ChatMessage, FeedbackReport, Participant, ParticipantStatus } from "./types";

type MeetingRoomState = {
  participants: Participant[];
  messages: ChatMessage[];
  activeSpeakerId: string | null;
  typingAgentId: string | null;
  handRaised: boolean;
  micEnabled: boolean;
  cameraEnabled: boolean;
  sessionEnded: boolean;
  feedbackOpen: boolean;
  interruptionsCount: number;
  helpfulnessScore: number;
  confidenceScore: number;
  engagementScore: number;
  scenarioTitle: string;
  scenarioDescription: string;
  scenarioPrompt: string;
  remainingSec: number;
  elapsedSec: number;
  analyticsHistory: AnalyticsSnapshot[];
  feedbackReport: FeedbackReport | null;
};

type MeetingRoomActions = {
  tickSecond: () => void;
  setParticipantStatus: (participantId: string, status: ParticipantStatus) => void;
  startAiSpeakingTurn: (participantId: string) => void;
  stopAiSpeakingTurn: (participantId: string) => void;
  addAiMessage: (participantId: string, text?: string) => void;
  addCandidateMessage: (text: string) => void;
  setTypingAgent: (participantId: string | null) => void;
  triggerHelpSignal: (participantId: string) => void;
  clearHelpSignal: (participantId: string) => void;
  updateMetricsPulse: () => void;
  registerInterruption: () => void;
  toggleMic: () => void;
  toggleCamera: () => void;
  toggleHandRaise: () => void;
  endSession: () => void;
  closeFeedback: () => void;
  restartSession: () => void;
};

type MeetingRoomStore = MeetingRoomState & MeetingRoomActions;

const bounded = (value: number, min: number, max: number): number => {
  return Math.min(max, Math.max(min, value));
};

const randomBetween = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

const randomPick = <T,>(list: T[]): T => {
  const index = Math.floor(Math.random() * list.length);
  return list[index];
};

const buildInitialState = (): MeetingRoomState => ({
  participants: initialParticipants,
  messages: [
    {
      id: crypto.randomUUID(),
      senderId: "ai-product",
      senderName: "Arjun",
      senderRole: "Product Manager",
      text: "Team, we have 36 hours. Let us align on a stabilization plan and decide what ships.",
      timestamp: Date.now(),
    },
    {
      id: crypto.randomUUID(),
      senderId: "ai-backend",
      senderName: "Rahul",
      senderRole: "Backend Developer",
      text: "I suspect our retry storm is amplifying latency. I will start with request traces.",
      timestamp: Date.now(),
    },
  ],
  activeSpeakerId: null,
  typingAgentId: null,
  handRaised: false,
  micEnabled: true,
  cameraEnabled: true,
  sessionEnded: false,
  feedbackOpen: false,
  interruptionsCount: 0,
  helpfulnessScore: 72,
  confidenceScore: 70,
  engagementScore: 74,
  scenarioTitle: initialScenario.title,
  scenarioDescription: initialScenario.description,
  scenarioPrompt: initialScenario.problemStatement,
  remainingSec: initialScenario.durationSec,
  elapsedSec: 0,
  analyticsHistory: [
    {
      elapsedSec: 0,
      confidence: 70,
      helpfulness: 72,
      engagement: 74,
    },
  ],
  feedbackReport: null,
});

const buildFeedbackReport = (state: MeetingRoomState): FeedbackReport => {
  const speakingShare = getSpeakingShare(state.participants);
  const candidateShare = speakingShare[candidateId] ?? 0;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  if (state.helpfulnessScore >= 75) strengths.push("Provided constructive, solution-oriented contributions.");
  if (state.confidenceScore >= 75) strengths.push("Maintained clear ownership and decisive communication.");
  if (state.engagementScore >= 75) strengths.push("Stayed actively involved across teammate threads.");
  if (candidateShare >= 18 && candidateShare <= 34) strengths.push("Balanced speaking time with team collaboration.");

  if (state.interruptionsCount > 4) weaknesses.push("Frequent interruptions reduced discussion clarity.");
  if (state.helpfulnessScore < 70) weaknesses.push("Responses could include more concrete next actions.");
  if (state.confidenceScore < 70) weaknesses.push("Decision framing lacked firmness under pressure.");
  if (candidateShare < 14) weaknesses.push("Participation was low for a high-urgency planning room.");
  if (candidateShare > 42) weaknesses.push("Dominated airtime; invite more teammate synthesis.");

  if (strengths.length === 0) {
    strengths.push("Maintained composure during a high-pressure simulation.");
  }

  if (weaknesses.length === 0) {
    weaknesses.push("Could further increase strategic questioning depth.");
  }

  const overallScore = Math.round(
    (state.helpfulnessScore * 0.3 + state.confidenceScore * 0.3 + state.engagementScore * 0.3 + Math.max(0, 100 - state.interruptionsCount * 8) * 0.1) /
      1,
  );

  return {
    overallScore: bounded(overallScore, 1, 100),
    strengths,
    weaknesses,
    summary:
      "You coordinated a dynamic team discussion with mixed urgency signals. Focus on sharper prioritization language and explicit delegation to improve execution speed.",
  };
};

const getSpeakingShare = (participants: Participant[]): Record<string, number> => {
  const total = participants.reduce((acc, participant) => acc + participant.speakingTimeSec, 0);
  const safeTotal = total <= 0 ? 1 : total;

  return participants.reduce<Record<string, number>>((acc, participant) => {
    acc[participant.id] = Math.round((participant.speakingTimeSec / safeTotal) * 100);
    return acc;
  }, {});
};

export const useMeetingRoomStore = create<MeetingRoomStore>((set, get) => ({
  ...buildInitialState(),

  tickSecond: () => {
    set((state) => {
      if (state.sessionEnded) {
        return state;
      }

      const nextParticipants = state.participants.map((participant) => {
        if (participant.id === state.activeSpeakerId) {
          return { ...participant, speakingTimeSec: participant.speakingTimeSec + 1 };
        }
        return participant;
      });

      const nextRemaining = Math.max(0, state.remainingSec - 1);
      const nextElapsed = state.elapsedSec + 1;

      const nextState: Partial<MeetingRoomState> = {
        participants: nextParticipants,
        remainingSec: nextRemaining,
        elapsedSec: nextElapsed,
      };

      if (nextRemaining <= 0) {
        const terminalState = {
          ...state,
          ...nextState,
          sessionEnded: true,
          feedbackOpen: true,
          feedbackReport: buildFeedbackReport({ ...state, ...nextState } as MeetingRoomState),
        } as MeetingRoomState;
        return terminalState;
      }

      return nextState as MeetingRoomState;
    });
  },

  setParticipantStatus: (participantId, status) => {
    set((state) => ({
      participants: state.participants.map((participant) =>
        participant.id === participantId ? { ...participant, status } : participant,
      ),
    }));
  },

  startAiSpeakingTurn: (participantId) => {
    set((state) => {
      if (state.sessionEnded) return state;

      return {
        activeSpeakerId: participantId,
        participants: state.participants.map((participant) => {
          if (participant.id === participantId) {
            return { ...participant, status: "speaking" };
          }

          if (participant.status === "needs_help") {
            return participant;
          }

          return { ...participant, status: "idle" };
        }),
      };
    });
  },

  stopAiSpeakingTurn: (participantId) => {
    set((state) => {
      if (state.activeSpeakerId !== participantId) {
        return state;
      }

      return {
        activeSpeakerId: null,
        participants: state.participants.map((participant) => {
          if (participant.id !== participantId) return participant;
          return { ...participant, status: "idle" };
        }),
      };
    });
  },

  addAiMessage: (participantId, text) => {
    set((state) => {
      const sender = state.participants.find((participant) => participant.id === participantId);
      if (!sender) return state;

      return {
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            senderId: sender.id,
            senderName: sender.name,
            senderRole: sender.role,
            text: text ?? randomPick(aiChatSeeds),
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  addCandidateMessage: (text) => {
    set((state) => {
      const candidate = state.participants.find((participant) => participant.id === candidateId);
      if (!candidate) return state;

      return {
        messages: [
          ...state.messages,
          {
            id: crypto.randomUUID(),
            senderId: candidate.id,
            senderName: candidate.name,
            senderRole: candidate.role,
            text,
            timestamp: Date.now(),
          },
        ],
      };
    });
  },

  setTypingAgent: (participantId) => {
    set({ typingAgentId: participantId });
  },

  triggerHelpSignal: (participantId) => {
    set((state) => ({
      participants: state.participants.map((participant) =>
        participant.id === participantId ? { ...participant, status: "needs_help" } : participant,
      ),
      messages: [
        ...state.messages,
        {
          id: crypto.randomUUID(),
          senderId: participantId,
          senderName: state.participants.find((p) => p.id === participantId)?.name ?? "AI Teammate",
          senderRole: state.participants.find((p) => p.id === participantId)?.role ?? "Teammate",
          text: randomPick(helpSignals),
          timestamp: Date.now(),
        },
      ],
    }));
  },

  clearHelpSignal: (participantId) => {
    set((state) => ({
      participants: state.participants.map((participant) => {
        if (participant.id === participantId && participant.status === "needs_help") {
          return { ...participant, status: "idle" };
        }
        return participant;
      }),
    }));
  },

  updateMetricsPulse: () => {
    set((state) => {
      if (state.sessionEnded) return state;

      const confidence = bounded(state.confidenceScore + randomBetween(-3.6, 3.1), 45, 96);
      const helpfulness = bounded(state.helpfulnessScore + randomBetween(-2.9, 3.2), 42, 97);
      const engagement = bounded(state.engagementScore + randomBetween(-2.5, 2.8), 40, 98);

      const nextHistory = [
        ...state.analyticsHistory,
        {
          elapsedSec: state.elapsedSec,
          confidence: Math.round(confidence),
          helpfulness: Math.round(helpfulness),
          engagement: Math.round(engagement),
        },
      ].slice(-40);

      return {
        confidenceScore: Math.round(confidence),
        helpfulnessScore: Math.round(helpfulness),
        engagementScore: Math.round(engagement),
        analyticsHistory: nextHistory,
      };
    });
  },

  registerInterruption: () => {
    set((state) => ({ interruptionsCount: state.interruptionsCount + 1 }));
  },

  toggleMic: () => {
    set((state) => ({
      micEnabled: !state.micEnabled,
      participants: state.participants.map((participant) =>
        participant.id === candidateId ? { ...participant, isMuted: state.micEnabled } : participant,
      ),
    }));
  },

  toggleCamera: () => {
    set((state) => ({ cameraEnabled: !state.cameraEnabled }));
  },

  toggleHandRaise: () => {
    set((state) => ({ handRaised: !state.handRaised }));
  },

  endSession: () => {
    const state = get();
    if (state.sessionEnded) {
      set({ feedbackOpen: true });
      return;
    }

    set((currentState) => ({
      sessionEnded: true,
      feedbackOpen: true,
      activeSpeakerId: null,
      participants: currentState.participants.map((participant) => ({ ...participant, status: "idle" })),
      feedbackReport: buildFeedbackReport(currentState),
    }));
  },

  closeFeedback: () => {
    set({ feedbackOpen: false });
  },

  restartSession: () => {
    set(buildInitialState());
  },
}));

export const selectSpeakingShare = (participants: Participant[]): Record<string, number> => {
  return getSpeakingShare(participants);
};
