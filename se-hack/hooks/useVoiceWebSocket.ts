import { useEffect, useRef, useState, useCallback } from "react";

export interface VoiceOutput {
  acoustic?: {
    pitch: number;
    energy: number;
    speaking_rate: number;
  };
  semantic?: {
    insight: string;
    stress_level: string;
    confidence_score: number;
    time_range?: number[];
    words?: string[];
  };
  final_summary?: {
    overall_summary: string;
    key_moments: { time: string; description: string }[];
  };
}

export interface TranscriptWord {
  word: string;
  start: number;
  end: number;
  timestamp: string; // formatted MM:SS
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function useVoiceWebSocket(isRecording: boolean) {
  const socketRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [metrics, setMetrics] = useState<VoiceOutput>({});
  const [transcript, setTranscript] = useState<TranscriptWord[]>([]);
  const [insights, setInsights] = useState<VoiceOutput["semantic"][]>([]);

  // Send emotion context from video analysis to the voice backend
  const sendEmotionContext = useCallback(
    (emotion: string, confidence: number, emotionBreakdown?: Record<string, number>, extraVideoMetrics?: any) => {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(
          JSON.stringify({
            type: "emotion_context",
            emotion,
            confidence,
            emotion_breakdown: emotionBreakdown,
            extra_video_metrics: extraVideoMetrics,
          })
        );
      }
    },
    []
  );

  useEffect(() => {
    if (isRecording) {
      const match = document.cookie.match(new RegExp("(^| )access_token=([^;]+)"));
      const token = match ? match[2] : "";

      const wsUrl = `ws://localhost:8000/voice/stream?token=${token}`;
      const ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === "transcript_word") {
            // Live word streaming from backend
            setTranscript((prev) => [
              ...prev,
              {
                word: data.word,
                start: data.start,
                end: data.end,
                timestamp: formatTime(data.start),
              },
            ]);
          }

          if (data.type === "periodic_insight") {
            setMetrics((prev) => ({
              ...prev,
              acoustic: data.acoustic || prev.acoustic,
              semantic: data.semantic || prev.semantic,
            }));

            if (data.semantic) {
              setInsights((prev) => [...prev, data.semantic]);
            }
          }

          if (data.type === "final_summary") {
            setMetrics((prev) => ({
              ...prev,
              final_summary: data.content,
            }));
          }
        } catch (e) {
          console.error("Failed to parse WS data", e);
        }
      };

      ws.onerror = (error) => {
        console.error("WebSocket error:", error);
      };

      navigator.mediaDevices
        .getUserMedia({ audio: true })
        .then((stream) => {
          streamRef.current = stream;

          const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
          const audioContext = new AudioContextClass({ sampleRate: 16000 });
          audioContextRef.current = audioContext;

          const source = audioContext.createMediaStreamSource(stream);
          const processor = audioContext.createScriptProcessor(4096, 1, 1);
          processorRef.current = processor;

          source.connect(processor);
          processor.connect(audioContext.destination);

          processor.onaudioprocess = (e) => {
            if (ws.readyState === WebSocket.OPEN) {
              const inputData = e.inputBuffer.getChannelData(0);

              const pcm16 = new Int16Array(inputData.length);
              for (let i = 0; i < inputData.length; i++) {
                let s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
              }

              ws.send(pcm16.buffer);
            }
          };
        })
        .catch((err) => {
          console.error("Microphone access denied:", err);
        });
    } else {
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send("STOP");
        // We do NOT aggressively close the socket from the frontend anymore.
        // We let the backend generate the LLM final summary, send it to us, and then the backend will safely close the connection.
      }

      if (processorRef.current) {
        processorRef.current.disconnect();
        processorRef.current.onaudioprocess = null;
        processorRef.current = null;
      }
      if (audioContextRef.current && audioContextRef.current.state !== "closed") {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    }

    return () => {
      // Unmount cleanup
    };
  }, [isRecording]);

  const resetState = useCallback(() => {
    setMetrics({});
    setTranscript([]);
    setInsights([]);
  }, []);

  const clearTranscript = useCallback(() => {
    setTranscript([]);
  }, []);

  const getTranscriptText = useCallback(() => {
    return transcript.map((w) => w.word).join(" ");
  }, [transcript]);

  return { metrics, transcript, insights, sendEmotionContext, resetState, clearTranscript, getTranscriptText };
}
