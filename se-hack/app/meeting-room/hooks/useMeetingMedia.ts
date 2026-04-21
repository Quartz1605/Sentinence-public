"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

const BACKEND_URL = "http://localhost:8000";

/**
 * Hook that connects webcam video + mic audio to the backend
 * analysis endpoints, and provides the real-time scores to the
 * meeting WebSocket metrics channel.
 *
 * Returns:
 *  - videoRef: ref to attach to a <video> element
 *  - latestVideoScores: { confidence, engagement, emotion, ... }
 *  - latestVoiceScores: { confidence, stress, ... }
 *  - isMediaReady: boolean
 *  - mediaError: string | null
 */
export type VideoScores = {
  confidence_score: number;
  engagement_score: number;
  dominant_emotion: string;
  face_detected: boolean;
  pose_detected: boolean;
};

export type VoiceScores = {
  confidence_score: number;
  stress_level: string;
};

export function useMeetingMedia(
  micEnabled: boolean,
  cameraEnabled: boolean,
  onSpeechTranscript?: (text: string) => void,
) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const processorRef = useRef<ScriptProcessorNode | null>(null);

  const [isMediaReady, setIsMediaReady] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [latestVideoScores, setLatestVideoScores] = useState<VideoScores | null>(null);
  const [latestVoiceScores, setLatestVoiceScores] = useState<VoiceScores | null>(null);

  const speechBufferRef = useRef<string[]>([]);
  const speechTimeoutRef = useRef<number | null>(null);

  // ── Setup webcam + mic on mount ───────────────────────────────
  useEffect(() => {
    let mounted = true;
    const canvas = document.createElement("canvas");
    canvasRef.current = canvas;

    async function init() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: true,
        });

        if (!mounted) {
          mediaStream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = mediaStream;

        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }

        setIsMediaReady(true);
        setMediaError(null);
      } catch (err: any) {
        if (mounted) setMediaError(`Camera/mic access failed: ${err.message}`);
      }
    }

    init();

    return () => {
      mounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }
    };
  }, []);

  // ── Toggle mic tracks ─────────────────────────────────────────
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getAudioTracks().forEach((t) => {
        t.enabled = micEnabled;
      });
    }
  }, [micEnabled]);

  // ── Toggle video tracks ───────────────────────────────────────
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.getVideoTracks().forEach((t) => {
        t.enabled = cameraEnabled;
      });
    }
  }, [cameraEnabled]);

  // ── Video frame analysis loop (~2 FPS to keep it light) ───────
  useEffect(() => {
    if (!isMediaReady || !cameraEnabled) return;

    const interval = setInterval(async () => {
      if (!videoRef.current || !canvasRef.current) return;
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/jpeg", 0.5);

      try {
        const res = await axios.post(`${BACKEND_URL}/video/analyze-frame`, {
          frame: dataUrl,
        });
        setLatestVideoScores(res.data);
      } catch {
        // Silently ignore — backend might be busy
      }
    }, 500); // 2 FPS

    return () => clearInterval(interval);
  }, [isMediaReady, cameraEnabled]);

  // ── Voice WebSocket streaming ─────────────────────────────────
  useEffect(() => {
    if (!isMediaReady || !micEnabled) return;

    const stream = streamRef.current;
    if (!stream) return;

    let ws: WebSocket;
    let audioCtx: AudioContext;
    let processor: ScriptProcessorNode;

    try {
      ws = new WebSocket(`ws://localhost:8000/voice/stream`);
      wsRef.current = ws;

      ws.onopen = () => {
        // Set up audio processing
        audioCtx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        processor = audioCtx.createScriptProcessor(4096, 1, 1);
        processorRef.current = processor;

        processor.onaudioprocess = (e) => {
          if (ws.readyState !== WebSocket.OPEN) return;
          const inputData = e.inputBuffer.getChannelData(0);
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
          if (data.type === "periodic_insight" && data.semantic) {
            setLatestVoiceScores({
              confidence_score: data.semantic.confidence_score ?? 0.7,
              stress_level: data.semantic.stress_level ?? "low",
            });
          } else if (data.type === "transcript_word" && data.word) {
            speechBufferRef.current.push(data.word);

            if (speechTimeoutRef.current) {
              window.clearTimeout(speechTimeoutRef.current);
            }

            speechTimeoutRef.current = window.setTimeout(() => {
              if (speechBufferRef.current.length > 0) {
                const phrase = speechBufferRef.current.join(" ");
                speechBufferRef.current = [];
                if (onSpeechTranscript) {
                  onSpeechTranscript(phrase);
                }
              }
            }, 2000); // 2 second pause = end of phrase
          }
        } catch {
          // ignore parse errors
        }
      };

      ws.onerror = () => {
        // Voice WS failed silently — not critical
      };
    } catch {
      // WebSocket not available
    }

    return () => {
      if (processorRef.current) {
        processorRef.current.disconnect();
      }
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
      }
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send("STOP");
        wsRef.current.close();
      }
    };
  }, [isMediaReady, micEnabled]);

  return {
    videoRef,
    latestVideoScores,
    latestVoiceScores,
    isMediaReady,
    mediaError,
  };
}
