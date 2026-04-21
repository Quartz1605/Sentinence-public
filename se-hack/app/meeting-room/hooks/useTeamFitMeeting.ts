"use client";

import { useCallback, useState } from "react";

import { backendClient } from "@/lib/backend";
import {
  MeetingResultResponse,
  MeetingScenarioOption,
  RespondMeetingResponse,
  StartMeetingResponse,
} from "../types";

export function useTeamFitMeeting() {
  const [loading, setLoading] = useState(false);

  const getScenarios = useCallback(async (): Promise<MeetingScenarioOption[]> => {
    const res = await backendClient.get<MeetingScenarioOption[]>("/meeting-room/scenarios");
    return res.data;
  }, []);

  const startMeeting = useCallback(async (scenarioId: string, customContext?: string): Promise<StartMeetingResponse> => {
    setLoading(true);
    try {
      const res = await backendClient.post<StartMeetingResponse>("/meeting-room/start", {
        scenario_id: scenarioId,
        custom_context: customContext?.trim() ? customContext.trim() : undefined,
      });
      return res.data;
    } finally {
      setLoading(false);
    }
  }, []);

  const respondMeeting = useCallback(
    async (payload: {
      sessionId: string;
      answerText?: string;
      audioBase64?: string;
      audioMimeType?: string;
    }): Promise<RespondMeetingResponse> => {
      setLoading(true);
      try {
        const res = await backendClient.post<RespondMeetingResponse>("/meeting-room/respond", {
          session_id: payload.sessionId,
          answer_text: payload.answerText,
          audio_base64: payload.audioBase64,
          audio_mime_type: payload.audioMimeType,
        });
        return res.data;
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const getResult = useCallback(async (sessionId: string): Promise<MeetingResultResponse> => {
    const res = await backendClient.get<MeetingResultResponse>("/meeting-room/result", {
      params: { session_id: sessionId },
    });
    return res.data;
  }, []);

  return {
    loading,
    getScenarios,
    startMeeting,
    respondMeeting,
    getResult,
  };
}
