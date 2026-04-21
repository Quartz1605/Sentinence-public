import { backendClient } from "@/lib/backend";

export type ResultsOverview = {
  total_sessions: number;
  completed_sessions: number;
  total_answers: number;
  avg_score: number;
  improvement_delta: number;
  contradiction_rate: number;
};

export type ScoreTrendPoint = {
  session_id: string;
  date: string;
  role: string;
  avg_score: number;
};

export type CommunicationTrendPoint = {
  session_id: string;
  date: string;
  confidence: number | null;
  clarity: number | null;
  nervousness: number | null;
  posture: number | null;
  gaze: number | null;
  fidgeting: number | null;
};

export type WeaknessPoint = {
  area: string;
  frequency: number;
  avg_score_when_observed: number;
  impact_score: number;
  evidence: string[];
  suggested_actions: string[];
};

export type StrengthPoint = {
  area: string;
  frequency: number;
  evidence: string[];
};

export type RoleBreakdownPoint = {
  role: string;
  sessions: number;
  avg_score: number;
  confidence: number | null;
  clarity: number | null;
  nervousness: number | null;
};

export type SessionSnapshot = {
  session_id: string;
  role: string;
  difficulty: string;
  status: string;
  date: string;
  question_count: number;
  avg_score: number | null;
  contradictions: number;
  top_strengths: string[];
  top_weaknesses: string[];
  confidence: number | null;
  clarity: number | null;
  nervousness: number | null;
  dominant_emotion: string | null;
};

export type RadarMetric = {
  metric: string;
  score: number;
};

export type HeatmapPoint = {
  area: string;
  technical: number;
  communication: number;
  consistency: number;
};

export type LlmWeaknessInsight = {
  area: string;
  impact_score: number;
  rationale: string;
  action_items: string[];
};

export type LlmStrengthInsight = {
  area: string;
  rationale: string;
};

export type CoachingStep = {
  phase: string;
  objective: string;
  action_items: string[];
  success_metric: string;
};

export type LlmInsights = {
  summary: string;
  trajectory: string;
  confidence_note: string;
  key_weaknesses: LlmWeaknessInsight[];
  key_strengths: LlmStrengthInsight[];
  coaching_plan: CoachingStep[];
  focus_radar: RadarMetric[];
  weakness_heatmap: HeatmapPoint[];
};

export type ResultsAnalysisResponse = {
  generated_at: string;
  overview: ResultsOverview;
  score_trend: ScoreTrendPoint[];
  communication_trend: CommunicationTrendPoint[];
  weaknesses: WeaknessPoint[];
  strengths: StrengthPoint[];
  role_breakdown: RoleBreakdownPoint[];
  session_snapshots: SessionSnapshot[];
  llm_insights: LlmInsights;
};

export async function getResultsAnalysis(): Promise<ResultsAnalysisResponse> {
  const response = await backendClient.get<ResultsAnalysisResponse>("/results/analysis");
  return response.data;
}

export async function refreshResultsAnalysis(): Promise<ResultsAnalysisResponse> {
  const response = await backendClient.post<ResultsAnalysisResponse>("/results/analysis/refresh");
  return response.data;
}
