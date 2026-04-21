"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { Bot, LoaderCircle, Mic, MicOff, Plug, PlugZap, Send, Sparkles, Volume2 } from "lucide-react";
import TalkingAvatar from "@/components/interview/TalkingAvatar";

import {
  type AnswerEvaluation,
  type InterviewDetailResponse,
  getInterviewDetails,
  startInterview,
  submitInterviewAnswer,
} from "@/lib/interviewAgentApi";
import { MotivatingAtmosphere } from "@/components/MotivatingAtmosphere";

type Turn = {
  question: string;
  answer: string;
  evaluation: AnswerEvaluation;
};

const ROLE_OPTIONS = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Engineer",
  "Machine Learning Engineer",
  "DevOps Engineer",
] as const;

const DIFFICULTY_OPTIONS = ["easy", "medium", "hard"] as const;

const PERSONA_OPTIONS = ["mentor", "friendly", "aggressive", "neutral", "devil's advocate"] as const;

type RoleOption = (typeof ROLE_OPTIONS)[number];
type DifficultyOption = (typeof DIFFICULTY_OPTIONS)[number];
type PersonaOption = (typeof PERSONA_OPTIONS)[number];

const DEFAULT_CONFIG = {
  role: "Frontend Engineer" as RoleOption,
  difficulty: "medium" as DifficultyOption,
  persona: "mentor" as PersonaOption,
};

type WsConnectionState = "disconnected" | "connecting" | "connected";

export default function InterviewAgentPage() {
  const [role, setRole] = useState<RoleOption>(DEFAULT_CONFIG.role);
  const [difficulty, setDifficulty] = useState<DifficultyOption>(DEFAULT_CONFIG.difficulty);
  const [persona, setPersona] = useState<PersonaOption>(DEFAULT_CONFIG.persona);

  const [interviewId, setInterviewId] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "ongoing" | "completed">("idle");
  const [currentQuestion, setCurrentQuestion] = useState<string | null>(null);
  const [currentQuestionAudio, setCurrentQuestionAudio] = useState<string | null>(null);
  const [isQuestionAudioPlaying, setIsQuestionAudioPlaying] = useState(false);
  const [answer, setAnswer] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [historyDetail, setHistoryDetail] = useState<InterviewDetailResponse | null>(null);

  const [loadingStart, setLoadingStart] = useState(false);
  const [loadingSubmit, setLoadingSubmit] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [wsState, setWsState] = useState<WsConnectionState>("disconnected");
  const [micStreaming, setMicStreaming] = useState(false);
  const [sttPartial, setSttPartial] = useState("");
  const [sttFinal, setSttFinal] = useState("");
  const [realtimeAiText, setRealtimeAiText] = useState("");
  const [aiSpeakingState, setAiSpeakingState] = useState<"idle" | "thinking" | "speaking">("idle");
  const [realtimeError, setRealtimeError] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const processorNodeRef = useRef<ScriptProcessorNode | null>(null);
  const playbackQueueRef = useRef<string[]>([]);
  const activeAudioRef = useRef<HTMLAudioElement | null>(null);
  const playbackBusyRef = useRef(false);
  const questionReplayTimeoutRef = useRef<number | null>(null);

  const canStart = useMemo(() => !loadingStart, [loadingStart]);

  const canSubmit = useMemo(() => {
    return !!interviewId && !!currentQuestion && answer.trim().length > 0 && status === "ongoing" && !loadingSubmit;
  }, [interviewId, currentQuestion, answer, status, loadingSubmit]);

  const canStartMic = wsState === "connected" && !micStreaming;

  const stopPlayback = () => {
    if (activeAudioRef.current) {
      activeAudioRef.current.pause();
      activeAudioRef.current.src = "";
      activeAudioRef.current = null;
    }
    playbackQueueRef.current = [];
    playbackBusyRef.current = false;
  };

  const playQueuedAudio = () => {
    if (playbackBusyRef.current) {
      return;
    }

    const next = playbackQueueRef.current.shift();
    if (!next) {
      return;
    }

    playbackBusyRef.current = true;
    const audio = new Audio(next);
    activeAudioRef.current = audio;

    const finish = () => {
      playbackBusyRef.current = false;
      activeAudioRef.current = null;
      playQueuedAudio();
    };

    audio.onended = finish;
    audio.onerror = finish;
    void audio.play().catch(() => {
      finish();
    });
  };

  const enqueueAudioChunk = (mime: string, b64: string) => {
    playbackQueueRef.current.push(`data:${mime};base64,${b64}`);
    playQueuedAudio();
  };

  const toPcm16Buffer = (input: Float32Array): ArrayBuffer => {
    const pcm = new Int16Array(input.length);
    for (let i = 0; i < input.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, input[i]));
      pcm[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
    }
    return pcm.buffer;
  };

  const stopMicStreamingSession = async () => {
    if (processorNodeRef.current) {
      processorNodeRef.current.disconnect();
      processorNodeRef.current.onaudioprocess = null;
      processorNodeRef.current = null;
    }

    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
    }

    if (audioContextRef.current) {
      await audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "audio_end" }));
    }

    setMicStreaming(false);
  };

  const startMicStreamingSession = async () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setRealtimeError("Realtime socket is not connected.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      mediaStreamRef.current = stream;

      const audioContext = new AudioContext({ sampleRate: 16000 });
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      sourceNodeRef.current = source;

      const processor = audioContext.createScriptProcessor(4096, 1, 1);
      processorNodeRef.current = processor;

      processor.onaudioprocess = (event) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          return;
        }
        const input = event.inputBuffer.getChannelData(0);
        const pcmBuffer = toPcm16Buffer(input);
        wsRef.current.send(pcmBuffer);
      };

      source.connect(processor);
      processor.connect(audioContext.destination);

      setRealtimeError(null);
      setMicStreaming(true);
    } catch {
      setRealtimeError("Microphone permission denied or unavailable.");
    }
  };

  const disconnectRealtime = async () => {
    await stopMicStreamingSession();
    stopPlayback();

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setWsState("disconnected");
    setAiSpeakingState("idle");
  };

  const buildRealtimeWsUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
    const url = new URL(baseUrl);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    url.pathname = "/interview-agent/ws";
    url.search = "";
    return url.toString();
  };

  const connectRealtime = () => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      return;
    }

    setWsState("connecting");
    setRealtimeError(null);

    const ws = new WebSocket(buildRealtimeWsUrl());
    wsRef.current = ws;

    ws.onopen = () => {
      setWsState("connected");
    };

    ws.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data as string) as {
          type?: string;
          text?: string;
          message?: string;
          state?: "idle" | "thinking" | "speaking";
          mime?: string;
          audio_b64?: string;
        };

        if (payload.type === "stt_partial") {
          setSttPartial(payload.text ?? "");
          return;
        }

        if (payload.type === "stt_final") {
          setSttPartial("");
          setSttFinal(payload.text ?? "");
          return;
        }

        if (payload.type === "llm_chunk") {
          setRealtimeAiText((prev) => `${prev}${payload.text ?? ""}`);
          return;
        }

        if (payload.type === "ai_state") {
          setAiSpeakingState(payload.state ?? "idle");
          if (payload.state === "thinking") {
            setRealtimeAiText("");
          }
          return;
        }

        if (payload.type === "ai_audio_chunk" && payload.mime && payload.audio_b64) {
          enqueueAudioChunk(payload.mime, payload.audio_b64);
          return;
        }

        if (payload.type === "ai_interrupted") {
          stopPlayback();
          setAiSpeakingState("idle");
          return;
        }

        if (payload.type === "error") {
          setRealtimeError(payload.message ?? payload.text ?? "Realtime error from server.");
        }
      } catch {
        setRealtimeError("Invalid realtime payload received.");
      }
    };

    ws.onerror = () => {
      setRealtimeError("Realtime websocket error.");
    };

    ws.onclose = () => {
      void stopMicStreamingSession();
      stopPlayback();
      setWsState("disconnected");
      setAiSpeakingState("idle");
    };
  };

  useEffect(() => {
    setIsQuestionAudioPlaying(Boolean(currentQuestionAudio));
  }, [currentQuestionAudio]);

  useEffect(() => {
    return () => {
      if (questionReplayTimeoutRef.current !== null) {
        window.clearTimeout(questionReplayTimeoutRef.current);
      }
      void disconnectRealtime();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const replayQuestionAudio = () => {
    if (!currentQuestionAudio) {
      return;
    }

    setIsQuestionAudioPlaying(false);
    if (questionReplayTimeoutRef.current !== null) {
      window.clearTimeout(questionReplayTimeoutRef.current);
    }
    questionReplayTimeoutRef.current = window.setTimeout(() => {
      setIsQuestionAudioPlaying(true);
      questionReplayTimeoutRef.current = null;
    }, 0);
  };

  const handleStart = async (event: FormEvent) => {
    event.preventDefault();
    setError(null);
    setLoadingStart(true);

    try {
      const started = await startInterview({
        role,
        difficulty,
        persona,
      });

      setInterviewId(started.interview_id);
      setStatus(started.status);
      setCurrentQuestion(started.first_question);
      setCurrentQuestionAudio(started.first_question_audio_data_uri ?? null);
      setTurns([]);
      setHistoryDetail(null);
      setAnswer("");
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail ?? "Failed to start interview");
      } else {
        setError("Unexpected error while starting interview");
      }
    } finally {
      setLoadingStart(false);
    }
  };

  const handleSubmitAnswer = async () => {
    if (!interviewId || !currentQuestion || !answer.trim()) {
      return;
    }

    setError(null);
    setLoadingSubmit(true);

    try {
      const response = await submitInterviewAnswer({
        interview_id: interviewId,
        answer: answer.trim(),
      });

      setTurns((prev) => [
        ...prev,
        {
          question: currentQuestion,
          answer: answer.trim(),
          evaluation: response.evaluation,
        },
      ]);

      setAnswer("");
      setStatus(response.status);
      setCurrentQuestion(response.next_question);
      setCurrentQuestionAudio(response.next_question_audio_data_uri ?? null);

      if (response.status === "completed") {
        await loadInterviewDetail(interviewId);
      }
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail ?? "Failed to submit answer");
      } else {
        setError("Unexpected error while submitting answer");
      }
    } finally {
      setLoadingSubmit(false);
    }
  };

  const loadInterviewDetail = async (id: string) => {
    setLoadingHistory(true);
    try {
      const detail = await getInterviewDetails(id);
      setHistoryDetail(detail);
    } catch (err) {
      if (axios.isAxiosError(err)) {
        const detail = (err.response?.data as { detail?: string } | undefined)?.detail;
        setError(detail ?? "Failed to load interview history");
      } else {
        setError("Unexpected error while loading history");
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleReset = () => {
    setInterviewId(null);
    setStatus("idle");
    setCurrentQuestion(null);
    setCurrentQuestionAudio(null);
    setIsQuestionAudioPlaying(false);
    setAnswer("");
    setTurns([]);
    setHistoryDetail(null);
    setError(null);
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6 relative">
      {status === "idle" && <MotivatingAtmosphere />}
      <header className="rounded-3xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-6 sm:p-8 shadow-sm">
        <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1 text-xs uppercase tracking-[0.16em] text-[var(--text-secondary)]">
          <Bot className="h-3.5 w-3.5" />
          Interview Agent
        </div>
        <h1 className="mt-4 text-3xl font-serif text-[var(--text-primary)] sm:text-4xl">Adaptive AI Interview</h1>
        <p className="mt-3 max-w-3xl text-sm text-[var(--text-secondary)] sm:text-base">
          Connected to backend LangGraph flow: question generation, answer evaluation, decision routing,
          and next-question adaptation in real time.
        </p>
      </header>

      {error ? (
        <p className="rounded-lg border border-[var(--accent-danger)] bg-[var(--accent-danger)]/10 px-3 py-2 text-sm text-[var(--accent-danger)]">{error}</p>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-12">
        <article className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-5 xl:col-span-4 shadow-sm">
          <h2 className="text-lg font-serif text-[var(--text-primary)]">Configuration</h2>

          <form className="space-y-3" onSubmit={handleStart}>
            <SelectField
              label="Role"
              value={role}
              options={ROLE_OPTIONS}
              onChange={(value) => setRole(value as RoleOption)}
              disabled={status === "ongoing" || loadingStart}
            />
            <SelectField
              label="Difficulty"
              value={difficulty}
              options={DIFFICULTY_OPTIONS}
              onChange={(value) => setDifficulty(value as DifficultyOption)}
              disabled={status === "ongoing" || loadingStart}
            />
            <SelectField
              label="Persona"
              value={persona}
              options={PERSONA_OPTIONS}
              onChange={(value) => setPersona(value as PersonaOption)}
              disabled={status === "ongoing" || loadingStart}
            />

            <div className="flex gap-2 pt-2">
              <button
                type="submit"
                disabled={!canStart || status === "ongoing"}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-primary)]/90 disabled:cursor-not-allowed disabled:opacity-55 shadow-sm"
              >
                {loadingStart ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                {loadingStart ? "Starting..." : "Start Session"}
              </button>
              <button
                type="button"
                onClick={handleReset}
                className="h-10 rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 text-sm text-[var(--text-secondary)] transition hover:bg-[var(--surface-tertiary)]"
              >
                Reset
              </button>
            </div>
          </form>

          <div className="rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3 text-xs text-[var(--text-secondary)]">
            <p>Status: <span className="font-semibold capitalize text-[var(--text-primary)]">{status}</span></p>
            <p className="mt-1 break-all">Interview ID: {interviewId ?? "Not started"}</p>
            <p className="mt-1">Turns completed: {turns.length}</p>
          </div>
        </article>

        <article className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-5 xl:col-span-8 shadow-sm">
          <h2 className="text-lg font-serif text-[var(--text-primary)]">Live Interview</h2>

          {currentQuestion ? (
            <div className="rounded-xl border border-violet-200/20 bg-violet-200/10 p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs uppercase tracking-[0.14em] text-violet-200/75">Current Question</p>
                <button
                  type="button"
                  onClick={replayQuestionAudio}
                  disabled={!currentQuestionAudio}
                  className="inline-flex h-8 items-center gap-1 rounded-md border border-violet-200/35 bg-black/30 px-2 text-xs text-violet-100/90 transition hover:border-violet-200/60 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Volume2 className="h-3.5 w-3.5" />
                  Replay audio
                </button>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-violet-50">{currentQuestion}</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4 text-sm text-[var(--text-secondary)]">
              Start a session to receive the first adaptive question.
            </div>
          )}

          <div className="rounded-xl border border-violet-200/20 bg-black/35 p-4">
            <TalkingAvatar
              audioSrc={currentQuestionAudio ?? ""}
              isPlaying={Boolean(currentQuestionAudio) && isQuestionAudioPlaying}
            />
          </div>

          <div className="space-y-3">
            <label className="text-sm text-[var(--text-secondary)] font-medium">Your Answer</label>
            <textarea
              rows={6}
              value={answer}
              onChange={(e) => setAnswer(e.target.value)}
              disabled={status !== "ongoing"}
              placeholder="Write your answer here..."
              className="w-full resize-none rounded-xl border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent-primary)]/20 transition placeholder:text-[var(--text-tertiary)] focus:ring-2"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSubmitAnswer}
                disabled={!canSubmit}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-primary)]/90 disabled:cursor-not-allowed disabled:opacity-55 shadow-sm"
              >
                {loadingSubmit ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {loadingSubmit ? "Submitting..." : "Submit Answer"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-violet-200/20 bg-black/35 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs uppercase tracking-[0.14em] text-violet-200/75">Realtime Voice Stream</p>
              <p className="text-xs text-violet-100/70">Socket: {wsState}</p>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={connectRealtime}
                disabled={wsState === "connecting" || wsState === "connected"}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-violet-200/35 bg-black/30 px-3 text-xs text-violet-100 transition hover:border-violet-200/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Plug className="h-3.5 w-3.5" />
                Connect
              </button>
              <button
                type="button"
                onClick={() => {
                  void disconnectRealtime();
                }}
                disabled={wsState === "disconnected"}
                className="inline-flex h-9 items-center gap-1 rounded-md border border-violet-200/35 bg-black/30 px-3 text-xs text-violet-100 transition hover:border-violet-200/60 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <PlugZap className="h-3.5 w-3.5" />
                Disconnect
              </button>
              <button
                type="button"
                onClick={() => {
                  if (micStreaming) {
                    void stopMicStreamingSession();
                  } else {
                    void startMicStreamingSession();
                  }
                }}
                disabled={!canStartMic && !micStreaming}
                className="inline-flex h-9 items-center gap-1 rounded-md bg-violet-300 px-3 text-xs font-semibold text-black transition hover:bg-violet-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {micStreaming ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                {micStreaming ? "Stop Mic" : "Start Mic"}
              </button>
            </div>

            {realtimeError ? (
              <p className="mt-3 rounded-md border border-rose-300/40 bg-rose-300/10 px-2 py-1 text-xs text-rose-100">{realtimeError}</p>
            ) : null}

            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <div className="rounded-md border border-violet-200/20 bg-black/25 p-2">
                <p className="text-[11px] uppercase tracking-widest text-violet-200/70">STT Partial</p>
                <p className="mt-1 text-xs text-violet-100/85">{sttPartial || "..."}</p>
              </div>
              <div className="rounded-md border border-violet-200/20 bg-black/25 p-2">
                <p className="text-[11px] uppercase tracking-widest text-violet-200/70">STT Final</p>
                <p className="mt-1 text-xs text-violet-100/85">{sttFinal || "..."}</p>
              </div>
            </div>

            <div className="mt-2 rounded-md border border-violet-200/20 bg-black/25 p-2">
              <p className="text-[11px] uppercase tracking-widest text-violet-200/70">AI Stream ({aiSpeakingState})</p>
              <p className="mt-1 text-xs text-violet-100/85">{realtimeAiText || "Waiting for streamed reply..."}</p>
            </div>
          </div>
        </article>
      </div>

      <article className="space-y-4 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-5 shadow-sm">
        <h2 className="text-lg font-serif text-[var(--text-primary)]">Turn-by-Turn Evaluation</h2>
        {turns.length === 0 ? (
          <p className="text-sm text-[var(--text-secondary)]">No answers submitted yet.</p>
        ) : (
          <div className="space-y-4">
            {turns.map((turn, index) => (
              <div key={`${index}-${turn.question}`} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Turn {index + 1}</p>
                <p className="mt-2 text-sm text-[var(--text-primary)]"><span className="font-semibold">Q:</span> {turn.question}</p>
                <p className="mt-2 text-sm text-[var(--text-secondary)]"><span className="font-semibold text-[var(--text-primary)]">A:</span> {turn.answer}</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <InfoBlock label="Score" value={`${turn.evaluation.score}/10`} />
                  <InfoBlock label="Feedback" value={turn.evaluation.feedback} />
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <ListBlock label="Strengths" items={turn.evaluation.strengths} />
                  <ListBlock label="Weaknesses" items={turn.evaluation.weaknesses} />
                </div>
              </div>
            ))}
          </div>
        )}
      </article>

      {status === "completed" ? (
        <article className="space-y-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-serif text-[var(--text-primary)]">Session Complete</h2>
            <button
              type="button"
              onClick={() => {
                if (interviewId) {
                  void loadInterviewDetail(interviewId);
                }
              }}
              className="h-9 rounded-lg border border-[var(--border-default)] bg-[var(--surface-primary)] px-3 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
            >
              {loadingHistory ? "Loading..." : "Refresh History"}
            </button>
          </div>

          {historyDetail ? (
            <p className="text-sm text-[var(--text-secondary)]">
              Persisted responses in DB: {historyDetail.responses.length} for interview {historyDetail.interview.id}
            </p>
          ) : (
            <p className="text-sm text-[var(--text-tertiary)]">History will appear after load.</p>
          )}
        </article>
      ) : null}
    </section>
  );
}

type SelectFieldProps = {
  label: string;
  value: string;
  options: readonly string[];
  onChange: (value: string) => void;
  disabled?: boolean;
};

function SelectField({ label, value, options, onChange, disabled }: SelectFieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)] font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="h-10 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent-primary)]/20 transition focus:ring-2"
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

type InfoBlockProps = {
  label: string;
  value: string;
};

function InfoBlock({ label, value }: InfoBlockProps) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-sm text-[var(--text-primary)] font-medium">{value}</p>
    </div>
  );
}

type ListBlockProps = {
  label: string;
  items: string[];
};

function ListBlock({ label, items }: ListBlockProps) {
  return (
    <div className="rounded-lg border border-[var(--border-default)] bg-white p-3 shadow-sm">
      <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">{label}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1 text-sm text-[var(--text-secondary)]">
          {items.map((item, idx) => (
            <li key={`${label}-${idx}`}>• {item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-[var(--text-tertiary)] italic">No {label.toLowerCase()} noted.</p>
      )}
    </div>
  );
}
