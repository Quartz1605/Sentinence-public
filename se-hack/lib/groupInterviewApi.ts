import { backendClient } from "@/lib/backend";

export type InterviewerTrack = "technical" | "hr" | "mixed";
export type GroupInterviewStatus = "ongoing" | "completed";

export type GroupInterviewer = {
  id: string;
  name: string;
  track: InterviewerTrack;
};

export type GroupInterviewQuestion = {
  interviewer_id: string;
  interviewer_name: string;
  interviewer_track: InterviewerTrack;
  question: string;
  audio_data_uri?: string | null;
};

export type GroupInterviewEvaluation = {
  score: number;
  feedback: string;
  strengths: string[];
  weaknesses: string[];
};

export type GroupInterviewProgress = {
  current_turn: number;
  total_turns: number;
};

export type StartGroupInterviewResponse = {
  session_id: string;
  status: GroupInterviewStatus;
  interviewers: GroupInterviewer[];
  question: GroupInterviewQuestion;
  progress: GroupInterviewProgress;
};

export type SubmitGroupInterviewAnswerResponse = {
  session_id: string;
  status: GroupInterviewStatus;
  transcript: string;
  evaluation: GroupInterviewEvaluation;
  next_question: GroupInterviewQuestion | null;
  progress: GroupInterviewProgress;
};

export type GroupInterviewTurn = {
  interviewer_id: string;
  interviewer_name: string;
  interviewer_track: InterviewerTrack;
  question: string;
  answer: string;
  evaluation: GroupInterviewEvaluation;
  created_at: string;
};

export type GroupInterviewResultResponse = {
  session_id: string;
  status: GroupInterviewStatus;
  progress: GroupInterviewProgress;
  turns: GroupInterviewTurn[];
  result: {
    overall_score: number;
    summary: string;
    strengths: string[];
    weaknesses: string[];
  } | null;
};

export async function startGroupInterview(payload: {
  role: string;
  difficulty: string;
}): Promise<StartGroupInterviewResponse> {
  const response = await backendClient.post<StartGroupInterviewResponse>("/group-interview/start", payload);
  return response.data;
}

export async function submitGroupInterviewAnswer(payload: {
  session_id: string;
  answer_text?: string;
  audio_base64?: string;
  audio_mime_type?: string;
}): Promise<SubmitGroupInterviewAnswerResponse> {
  const response = await backendClient.post<SubmitGroupInterviewAnswerResponse>("/group-interview/respond", payload);
  return response.data;
}

export async function getGroupInterviewResult(sessionId: string): Promise<GroupInterviewResultResponse> {
  const response = await backendClient.get<GroupInterviewResultResponse>("/group-interview/result", {
    params: { session_id: sessionId },
  });
  return response.data;
}
