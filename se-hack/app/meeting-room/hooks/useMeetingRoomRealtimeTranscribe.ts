"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type RealtimeState = {
  transcript: string;
  isStreaming: boolean;
  connectionState: "idle" | "connecting" | "open" | "closed" | "error";
  error: string | null;
};

const WS_URL = "ws://localhost:8000/meeting-room/transcribe";

export function useMeetingRoomRealtimeTranscribe(enabled: boolean) {
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);

  const [state, setState] = useState<RealtimeState>({
    transcript: "",
    isStreaming: false,
    connectionState: "idle",
    error: null,
  });

  const cleanup = useCallback(async () => {
    processorRef.current?.disconnect();
    processorRef.current = null;

    if (audioContextRef.current) {
      await audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }

    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send("STOP");
      wsRef.current.close();
    }
    wsRef.current = null;

    setState((prev) => ({ ...prev, isStreaming: false, connectionState: "closed" }));
  }, []);

  const start = useCallback(async () => {
    if (!enabled) {
      setState((prev) => ({ ...prev, error: "Microphone is disabled." }));
      return;
    }

    setState((prev) => ({ ...prev, connectionState: "connecting", error: null }));

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = mediaStream;

      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = async () => {
        setState((prev) => ({ ...prev, connectionState: "open", isStreaming: true }));

        const audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(mediaStream);
        const processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (event) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = event.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(inputData.length);
          for (let i = 0; i < inputData.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
          }
          ws.send(int16.buffer);
        };

        source.connect(processor);
        processor.connect(audioCtx.destination);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === "transcript_word") {
            const text = typeof data.text === "string" ? data.text : "";
            setState((prev) => ({ ...prev, transcript: text }));
          }
          if (data.type === "transcript_final") {
            const text = typeof data.text === "string" ? data.text : "";
            setState((prev) => ({ ...prev, transcript: text }));
          }
          if (data.type === "transcript_cleared") {
            setState((prev) => ({ ...prev, transcript: "" }));
          }
        } catch {
          // Ignore malformed ws payloads.
        }
      };

      ws.onclose = () => {
        setState((prev) => ({ ...prev, isStreaming: false, connectionState: "closed" }));
      };

      ws.onerror = () => {
        setState((prev) => ({
          ...prev,
          isStreaming: false,
          connectionState: "error",
          error: "Realtime transcription socket error",
        }));
      };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to start realtime transcription";
      setState((prev) => ({
        ...prev,
        isStreaming: false,
        connectionState: "error",
        error: message,
      }));
    }
  }, [enabled]);

  const stop = useCallback(async () => {
    await cleanup();
  }, [cleanup]);

  const clearTranscript = useCallback(() => {
    setState((prev) => ({ ...prev, transcript: "" }));
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send("CLEAR");
    }
  }, []);

  useEffect(() => {
    return () => {
      void cleanup();
    };
  }, [cleanup]);

  return {
    ...state,
    start,
    stop,
    clearTranscript,
  };
}
