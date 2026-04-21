"use client";

import { useEffect, useRef, useState } from "react";
import { useMeetingRoomStore } from "../store";

const BACKEND_WS_URL = "ws://localhost:8000/meeting/stream";

export function useMeetingBackend(sessionId: string | null) {
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!sessionId) return;

    const ws = new WebSocket(BACKEND_WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "init", session_id: sessionId }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        const store = useMeetingRoomStore.getState();

        if (data.type === "ai_typing") {
          store.setTypingAgent(data.participant_id);
        } else if (data.type === "ai_message") {
          store.setTypingAgent(null);
          // Make sure we update the store without mocking
          useMeetingRoomStore.setState((state) => ({
            messages: [
              ...state.messages,
              {
                id: data.message_id || crypto.randomUUID(),
                senderId: data.participant_id,
                senderName: data.sender_name,
                senderRole: data.sender_role,
                text: data.text,
                timestamp: data.timestamp ? new Date(data.timestamp).getTime() : Date.now(),
              },
            ],
          }));
          store.startAiSpeakingTurn(data.participant_id);
          setTimeout(() => {
            useMeetingRoomStore.getState().stopAiSpeakingTurn(data.participant_id);
          }, Math.min(Math.max(data.text.length * 50, 2000), 10000));
        } else if (data.type === "metrics_update") {
          useMeetingRoomStore.setState((state) => ({
            confidenceScore: data.confidence,
            helpfulnessScore: data.helpfulness,
            engagementScore: data.engagement,
            analyticsHistory: [
              ...state.analyticsHistory,
              {
                elapsedSec: state.elapsedSec,
                confidence: data.confidence,
                helpfulness: data.helpfulness,
                engagement: data.engagement,
              },
            ].slice(-40),
          }));
        } else if (data.type === "final_report") {
          useMeetingRoomStore.setState({
            feedbackReport: data.report,
            feedbackOpen: true,
            sessionEnded: true,
          });
        }
      } catch (err) {
        console.error("Failed to parse meeting WS message", err);
      }
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [sessionId]);

  const sendChatMessage = (text: string) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "chat", text }));
      // Also add to local UI immediately
      useMeetingRoomStore.getState().addCandidateMessage(text);
    }
  };

  const sendMetricsTick = (metrics: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "metrics_tick", ...metrics }));
    }
  };

  const endSessionWS = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "end" }));
    }
  };

  return { sendChatMessage, sendMetricsTick, endSessionWS };
}
