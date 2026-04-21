export type ParticipantStatus = "speaking" | "idle" | "needs_help";

export type Participant = {
  id: string;
  name: string;
  role: string;
  personality: string;
  isAi: boolean;
  isMuted: boolean;
  status: ParticipantStatus;
  speakingTimeSec: number;
};

export type ChatMessage = {
  id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  timestamp: number;
};

export type Scenario = {
  id?: string;
  title: string;
  description: string;
  problemStatement: string;
  durationSec: number;
};

export type MeetingScenarioOption = {
  id: string;
  title: string;
  description: string;
};

export type TeamMate = {
  name: string;
  role: string;
};

export type TeamQuestion = {
  speaker: string;
  question: string;
  intent: string;
  audio_data_uri?: string | null;
  suggested_delay_ms?: number | null;
};

export type MeetingProgress = {
  answered: number;
  total: number;
};

export type MeetingEvaluation = {
  score: number;
  feedback: string;
  clarity: number;
  technical_reasoning: number;
  confidence: number;
  relevance: number;
  strengths: string[];
  improvements: string[];
};

export type MeetingResult = {
  score: number;
  feedback: string;
  dimension_scores: Record<string, number>;
  strengths: string[];
  improvements: string[];
  summary: string;
};

export type StartMeetingResponse = {
  session_id: string;
  status: "ongoing" | "completed";
  scenario: {
    id: string;
    title: string;
    description: string;
    focus: string;
    estimated_duration_sec: number;
  };
  participants: TeamMate[];
  question: TeamQuestion;
  progress: MeetingProgress;
};

export type RespondMeetingResponse = {
  session_id: string;
  status: "ongoing" | "completed";
  transcript: string;
  evaluation: MeetingEvaluation;
  next_question: TeamQuestion | null;
  progress: MeetingProgress;
  interruption?: TeamQuestion | null;
};

export type MeetingResultResponse = {
  session_id: string;
  status: "ongoing" | "completed";
  progress: MeetingProgress;
  result: MeetingResult;
};

export type AnalyticsSnapshot = {
  elapsedSec: number;
  confidence: number;
  helpfulness: number;
  engagement: number;
};

export type FeedbackReport = {
  overallScore: number;
  strengths: string[];
  weaknesses: string[];
  summary: string;
};
