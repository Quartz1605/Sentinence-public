"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Camera,
  Loader2,
  Mic,
  MicOff,
  PhoneOff,
  Play,
  SendHorizontal,
  Sparkles,
  Volume2,
} from "lucide-react";

import { useSpeechCapture } from "./hooks/useSpeechCapture";
import { useMeetingRoomRealtimeTranscribe } from "./hooks/useMeetingRoomRealtimeTranscribe";
import { useTeamFitMeeting } from "./hooks/useTeamFitMeeting";
import TalkingAvatar from "@/components/interview/TalkingAvatar";
import { CameraPreview } from "./components/CameraPreview";

const AI_IMAGE_SETS = [
  { closed: "/p2-face1.png", open: "/p2-face2.png", wide: "/p2-face3.png" },
  { closed: "/face-1.png", open: "/face-2.png", wide: "/face-3.png" },
  { closed: "/p3-face1.png", open: "/p3-face2.png", wide: "/p3-face3.png" },
];
import {
  MeetingEvaluation,
  MeetingResult,
  MeetingScenarioOption,
  TeamMate,
  TeamQuestion,
} from "./types";

type ConversationItem = {
  id: string;
  type: "question" | "answer" | "interruption";
  speaker: string;
  role?: string;
  text: string;
  intent?: string;
  evaluation?: MeetingEvaluation;
};

type ApiLikeError = {
  response?: {
    data?: {
      detail?: string;
    };
  };
};

function uniqueId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getApiErrorMessage(err: unknown, fallback: string): string {
  if (typeof err === "object" && err !== null) {
    const dataDetail = (err as ApiLikeError).response?.data?.detail;
    if (typeof dataDetail === "string" && dataDetail.trim()) {
      return dataDetail;
    }
  }
  if (err instanceof Error && err.message.trim()) {
    return err.message;
  }
  return fallback;
}

export default function MeetingRoomPage() {
  const { loading, getScenarios, startMeeting, respondMeeting, getResult } = useTeamFitMeeting();
  const { recording, error: recordingError, startRecording, stopRecording } = useSpeechCapture();

  const [scenarios, setScenarios] = useState<MeetingScenarioOption[]>([]);
  const [selectedScenario, setSelectedScenario] = useState<string>("production-crisis");
  const [customContext, setCustomContext] = useState("");

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [participants, setParticipants] = useState<TeamMate[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<TeamQuestion | null>(null);
  const [progress, setProgress] = useState<{ answered: number; total: number }>({ answered: 0, total: 0 });

  const [draftAnswer, setDraftAnswer] = useState("");
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [sessionResult, setSessionResult] = useState<MeetingResult | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const [micEnabled, setMicEnabled] = useState(true);
  const [isQuestionAudioPlaying, setIsQuestionAudioPlaying] = useState(false);

  const {
    transcript: liveTranscript,
    isStreaming: isLiveTranscribing,
    connectionState,
    error: realtimeError,
    start: startRealtimeTranscription,
    stop: stopRealtimeTranscription,
    clearTranscript,
  } = useMeetingRoomRealtimeTranscribe(micEnabled);

  useEffect(() => {
    let mounted = true;
    getScenarios()
      .then((items) => {
        if (!mounted) return;
        setScenarios(items);
        if (items.length > 0) {
          setSelectedScenario(items[0].id);
        }
      })
      .catch((err: unknown) => {
        if (!mounted) return;
        setServerError(getApiErrorMessage(err, "Failed to load scenarios"));
      });

    return () => {
      mounted = false;
    };
  }, [getScenarios]);

  const selectedScenarioLabel = useMemo(() => {
    return scenarios.find((item) => item.id === selectedScenario)?.title ?? "Meeting";
  }, [scenarios, selectedScenario]);

  const beginSession = async () => {
    try {
      setServerError(null);
      setSessionResult(null);
      setConversation([]);

      const response = await startMeeting(selectedScenario, customContext);
      setSessionId(response.session_id);
      setParticipants(response.participants);
      setCurrentQuestion(response.question);
      setProgress(response.progress);

      setConversation([
        {
          id: uniqueId("q"),
          type: "question",
          speaker: response.question.speaker,
          text: response.question.question,
          intent: response.question.intent,
        },
      ]);

      if (response.question.suggested_delay_ms) {
        window.setTimeout(() => setIsQuestionAudioPlaying(Boolean(response.question.audio_data_uri)), response.question.suggested_delay_ms);
      } else {
        setIsQuestionAudioPlaying(Boolean(response.question.audio_data_uri));
      }
    } catch (err: unknown) {
      setServerError(getApiErrorMessage(err, "Failed to start meeting simulation"));
    }
  };

  const submitTextAnswer = async () => {
    const effectiveAnswer = draftAnswer.trim() || liveTranscript.trim();
    if (!sessionId || !effectiveAnswer) return;
    await submitResponse({ answerText: effectiveAnswer });
    setDraftAnswer("");
    clearTranscript();
  };

  const submitVoiceAnswer = async () => {
    if (!sessionId) return;

    if (!recording) {
      await startRecording();
      return;
    }

    const recorded = await stopRecording();
    if (!recorded) {
      setServerError("No audio captured. Please try recording again.");
      return;
    }

    await submitResponse({ audioBase64: recorded.audioBase64, audioMimeType: recorded.mimeType });
  };

  const toggleRealtimeTranscription = async () => {
    if (isLiveTranscribing) {
      await stopRealtimeTranscription();
      return;
    }

    await startRealtimeTranscription();
  };

  const submitResponse = async (payload: { answerText?: string; audioBase64?: string; audioMimeType?: string }) => {
    if (!sessionId || !currentQuestion) return;

    try {
      setServerError(null);

      const response = await respondMeeting({
        sessionId,
        answerText: payload.answerText,
        audioBase64: payload.audioBase64,
        audioMimeType: payload.audioMimeType,
      });

      const resolvedTranscript = response.transcript;
      const answerEntry: ConversationItem = {
        id: uniqueId("a"),
        type: "answer",
        speaker: "You",
        text: resolvedTranscript,
        evaluation: response.evaluation,
      };

      const updates: ConversationItem[] = [answerEntry];

      if (response.interruption) {
        updates.push({
          id: uniqueId("i"),
          type: "interruption",
          speaker: response.interruption.speaker,
          text: response.interruption.question,
          intent: response.interruption.intent,
        });
      }

      if (response.next_question) {
        updates.push({
          id: uniqueId("q"),
          type: "question",
          speaker: response.next_question.speaker,
          text: response.next_question.question,
          intent: response.next_question.intent,
        });
      }

      setConversation((prev) => [...prev, ...updates]);
      setProgress(response.progress);
      setCurrentQuestion(response.next_question);

      if (response.next_question) {
        if (response.next_question.suggested_delay_ms) {
          window.setTimeout(() => setIsQuestionAudioPlaying(Boolean(response.next_question.audio_data_uri)), response.next_question.suggested_delay_ms);
        } else {
          setIsQuestionAudioPlaying(Boolean(response.next_question.audio_data_uri));
        }
      }

      if (response.status === "completed") {
        const finalResult = await getResult(sessionId);
        setSessionResult(finalResult.result);
      }
    } catch (err: unknown) {
      setServerError(getApiErrorMessage(err, "Failed to submit response"));
    }
  };

  const retryPlayCurrentQuestion = () => {
    setIsQuestionAudioPlaying(false);
    window.setTimeout(() => setIsQuestionAudioPlaying(true), 50);
  };

  return (
    <section className="mx-auto w-full max-w-7xl space-y-4 pb-2">
      <header className="rounded-3xl border border-[var(--border-default)] bg-gradient-to-br from-white to-[var(--surface-secondary)] p-5 shadow-sm sm:p-6">
        <p className="text-xs uppercase tracking-[0.19em] text-[var(--accent-primary)]">Team Fit Interview Simulation</p>
        <h1 className="mt-1 text-2xl font-semibold text-[var(--text-primary)] sm:text-3xl">Virtual Team Meeting Room</h1>
        <p className="mt-1 text-sm text-[var(--text-secondary)]">
          Meeting-style simulation with live transcript visibility, teammate prompts, and structured performance scoring.
        </p>
      </header>

      {!sessionId ? (
        <div className="grid gap-4 lg:grid-cols-[1fr_350px]">
          <section className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Choose Your Scenario</h2>
            <div className="mt-3 grid gap-3">
              {scenarios.map((scenario) => {
                const active = selectedScenario === scenario.id;
                return (
                  <button
                    key={scenario.id}
                    type="button"
                    onClick={() => setSelectedScenario(scenario.id)}
                    className={`rounded-xl border px-4 py-3 text-left transition ${
                      active
                        ? "border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/8 text-[var(--text-primary)]"
                        : "border-[var(--border-default)] bg-white text-[var(--text-secondary)] hover:border-[var(--accent-primary)]/25 hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <p className="text-sm font-semibold">{scenario.title}</p>
                    <p className="mt-1 text-xs text-[var(--text-tertiary)]">{scenario.description}</p>
                  </button>
                );
              })}
            </div>

            {selectedScenario === "custom-scenario" ? (
              <div className="mt-4">
                <label htmlFor="custom-context" className="text-xs uppercase tracking-[0.13em] text-[var(--text-tertiary)]">
                  Custom Context
                </label>
                <textarea
                  id="custom-context"
                  value={customContext}
                  onChange={(event) => setCustomContext(event.target.value)}
                  placeholder="Example: redesign discussion blocked by unresolved engineering dependencies"
                  className="mt-2 h-28 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent-primary)]/30 placeholder:text-[var(--text-tertiary)] focus:ring-2"
                />
              </div>
            ) : null}

            <button
              type="button"
              onClick={beginSession}
              disabled={loading || scenarios.length === 0}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[var(--accent-primary)]/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Start Meeting Simulation
            </button>
          </section>

          <aside className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
            <p className="text-xs uppercase tracking-[0.14em] text-[var(--text-tertiary)]">Participants Preview</p>
            <ul className="mt-3 space-y-2 text-sm text-[var(--text-primary)]">
              <li className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">Aman · Backend Engineer</li>
              <li className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">Riya · Product Manager</li>
              <li className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">Karan · Frontend Developer</li>
            </ul>
            <p className="mt-4 text-xs text-[var(--text-tertiary)]">
              Selected: <span className="text-[var(--accent-primary)]">{selectedScenarioLabel}</span>
            </p>
          </aside>
        </div>
      ) : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_350px]">
            <section className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-3 shadow-sm">
              <div className="grid gap-2 md:grid-cols-3">
                {participants.slice(0, 3).map((participant, idx) => {
                  const isActive = currentQuestion?.speaker === participant.name;
                  const imageSet = AI_IMAGE_SETS[idx % AI_IMAGE_SETS.length];

                  return (
                    <article
                      key={`tile-${participant.name}-${idx}`}
                      className="relative min-h-48 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 shadow-inner"
                    >
                      <div className="absolute inset-0 z-0">
                        <TalkingAvatar
                          audioSrc={isActive && currentQuestion?.audio_data_uri ? currentQuestion.audio_data_uri : ""}
                          isPlaying={isActive ? isQuestionAudioPlaying : false}
                          faceImages={imageSet}
                          isFluid
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent pointer-events-none" />
                      </div>
                      <p className="relative z-10 text-xs font-semibold text-white drop-shadow-md">{participant.name}</p>
                      <p className="relative z-10 text-[11px] font-medium text-white/80 drop-shadow-md">{participant.role}</p>
                      <div className="absolute bottom-2 left-2 z-10 rounded border border-[var(--border-default)] bg-white/90 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                        {isActive ? "Speaking" : "Listening"}
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="mt-2 grid gap-2 md:grid-cols-2 lg:px-12">
                <article className="relative min-h-44 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3 shadow-inner">
                  <CameraPreview />
                  <p className="relative z-10 text-xs font-semibold text-white drop-shadow-md">You</p>
                  <p className="relative z-10 text-[11px] font-medium text-white/80 drop-shadow-md">Candidate</p>
                  <div className="absolute bottom-2 left-2 z-10 rounded border border-[var(--border-default)] bg-white/90 px-1.5 py-0.5 text-[10px] text-[var(--text-secondary)]">
                    {isLiveTranscribing ? "Mic live" : "Mic idle"}
                  </div>
                </article>

                <article className="relative min-h-44 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] p-3">
                  <p className="text-xs text-[var(--text-secondary)]">Discussion Focus</p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">{currentQuestion?.intent ?? "session_complete"}</p>
                  <p className="mt-2 text-xs text-[var(--text-tertiary)]">Progress: {progress.answered}/{progress.total}</p>
                </article>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--border-default)] bg-white p-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Current Prompt</p>
                  <h2 className="mt-1 text-xl font-semibold text-[var(--text-primary)]">{selectedScenarioLabel}</h2>
                </div>
                <button
                  type="button"
                  onClick={retryPlayCurrentQuestion}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1.5 text-xs font-semibold text-[var(--text-secondary)] transition hover:border-[var(--accent-primary)]/30 hover:text-[var(--accent-primary)]"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Replay Audio
                </button>
              </div>

              <div className="mt-3 rounded-xl border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/6 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent-primary)]">Question</p>
                <p className="mt-1 text-sm text-[var(--text-primary)]">{currentQuestion?.question ?? "Session complete"}</p>
                {currentQuestion ? (
                  <div className="mt-2 flex items-center gap-2 text-xs text-[var(--text-secondary)]">
                    <span className="rounded-full border border-[var(--border-default)] bg-white px-2 py-0.5">Speaker: {currentQuestion.speaker}</span>
                    <span className="rounded-full border border-[var(--border-default)] bg-white px-2 py-0.5">Intent: {currentQuestion.intent}</span>
                  </div>
                ) : null}
              </div>

              <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Live Transcript</p>
                  <p className="text-[11px] text-[var(--text-tertiary)]">
                    {connectionState === "open" ? "Connected" : connectionState}
                  </p>
                </div>
                <textarea
                  value={liveTranscript}
                  readOnly
                  placeholder="Realtime transcript appears here while mic stream is active..."
                  className="mt-2 h-20 w-full resize-none rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)] outline-none"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={toggleRealtimeTranscription}
                    disabled={loading || !currentQuestion || !micEnabled}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                      isLiveTranscribing
                        ? "border border-[var(--accent-danger)]/35 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]"
                        : "border border-[var(--accent-primary)]/30 bg-[var(--accent-primary)]/8 text-[var(--accent-primary)]"
                    } disabled:cursor-not-allowed disabled:opacity-60`}
                  >
                    {isLiveTranscribing ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    {isLiveTranscribing ? "Stop live transcript" : "Start live transcript"}
                  </button>
                  <button
                    type="button"
                    onClick={clearTranscript}
                    className="rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-xs text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)]"
                  >
                    Clear
                  </button>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-2">
                <input
                  value={draftAnswer}
                  onChange={(event) => setDraftAnswer(event.target.value)}
                  placeholder="Type your response here (or leave empty to submit live transcript)..."
                  className="h-11 w-full rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 text-sm text-[var(--text-primary)] outline-none ring-[var(--accent-primary)]/30 placeholder:text-[var(--text-tertiary)] focus:ring-2"
                />
                <button
                  type="button"
                  onClick={submitTextAnswer}
                  disabled={loading || !currentQuestion || !(draftAnswer.trim() || liveTranscript.trim())}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--accent-primary)] text-white transition hover:bg-[var(--accent-primary)]/90 disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Send typed answer"
                >
                  <SendHorizontal className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={submitVoiceAnswer}
                  disabled={loading || !currentQuestion}
                  className={`inline-flex h-11 w-11 items-center justify-center rounded-xl border transition ${
                    recording
                      ? "border-[var(--accent-danger)]/50 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]"
                      : "border-[var(--accent-secondary)]/45 bg-[var(--accent-secondary)]/10 text-[var(--accent-secondary)]"
                  } disabled:cursor-not-allowed disabled:opacity-60`}
                  aria-label={recording ? "Stop recording" : "Start recording"}
                >
                  {recording ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </button>
              </div>

              <p className="mt-2 text-xs text-[var(--text-tertiary)]">
                {recording ? "Recording... click mic again to stop and submit." : "Use text or voice response for each teammate question."}
              </p>

              <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Conversation Log</p>
                <div className="mt-2 max-h-90 space-y-2 overflow-y-auto pr-1">
                  {conversation.map((item) => (
                    <article
                      key={item.id}
                      className={`rounded-lg border px-3 py-2 text-sm ${
                        item.type === "answer"
                          ? "border-[var(--accent-success)]/30 bg-[var(--accent-success)]/8 text-[var(--text-primary)]"
                          : item.type === "interruption"
                            ? "border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/10 text-[var(--text-primary)]"
                            : "border-[var(--accent-secondary)]/30 bg-[var(--accent-secondary)]/10 text-[var(--text-primary)]"
                      }`}
                    >
                      <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-secondary)]">
                        {item.type} · {item.speaker}
                        {item.intent ? ` · ${item.intent}` : ""}
                      </p>
                      <p className="mt-1">{item.text}</p>
                      {item.evaluation ? (
                        <div className="mt-2 grid gap-1 text-xs text-[var(--text-secondary)] sm:grid-cols-2">
                          <p>Score: {item.evaluation.score}/10</p>
                          <p>Clarity: {item.evaluation.clarity}</p>
                          <p>Reasoning: {item.evaluation.technical_reasoning}</p>
                          <p>Confidence: {item.evaluation.confidence}</p>
                        </div>
                      ) : null}
                    </article>
                  ))}
                </div>
              </div>

              <footer className="mt-3 flex justify-center">
                <div className="inline-flex items-center gap-2 rounded-full border border-[var(--border-default)] bg-white px-3 py-2 shadow-sm">
                  <button
                    type="button"
                    onClick={() => setMicEnabled((prev) => !prev)}
                    className={`inline-flex h-10 w-10 items-center justify-center rounded-full border ${
                      micEnabled
                        ? "border-[var(--accent-success)]/45 bg-[var(--accent-success)]/10 text-[var(--accent-success)]"
                        : "border-[var(--accent-danger)]/45 bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]"
                    }`}
                    aria-label="Toggle mic"
                  >
                    {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-default)] bg-[var(--surface-secondary)] text-[var(--text-secondary)]"
                    aria-label="Camera"
                  >
                    <Camera className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--accent-danger)] text-white"
                    aria-label="End"
                    title="End"
                  >
                    <PhoneOff className="h-4 w-4" />
                  </button>
                </div>
              </footer>
              </div>
            </section>

            <aside className="space-y-4">
              <section className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Progress</p>
                <p className="mt-1 text-xl font-semibold text-[var(--text-primary)]">
                  {progress.answered} / {progress.total}
                </p>
                <div className="mt-2 h-2 rounded-full bg-[var(--surface-tertiary)]">
                  <div
                    className="h-2 rounded-full bg-[var(--accent-primary)] transition-all"
                    style={{ width: `${progress.total > 0 ? (progress.answered / progress.total) * 100 : 0}%` }}
                  />
                </div>
              </section>

              <section className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Virtual Teammates</p>
                <ul className="mt-2 space-y-2">
                  {participants.map((participant) => (
                    <li key={participant.name} className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">{participant.name}</p>
                      <p className="text-xs text-[var(--text-tertiary)]">{participant.role}</p>
                    </li>
                  ))}
                </ul>
              </section>

              {sessionResult ? (
                <section className="rounded-2xl border border-[var(--accent-success)]/35 bg-[var(--accent-success)]/10 p-4 shadow-sm">
                  <div className="flex items-center gap-2 text-[var(--accent-success)]">
                    <Sparkles className="h-4 w-4" />
                    <p className="text-sm font-semibold">Final Evaluation</p>
                  </div>
                  <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{sessionResult.score}/10</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{sessionResult.feedback}</p>
                  <p className="mt-2 text-xs text-[var(--text-secondary)]">{sessionResult.summary}</p>
                  <div className="mt-3 rounded-lg border border-[var(--accent-success)]/25 bg-white/70 p-2 text-xs text-[var(--text-secondary)]">
                    <p>Strengths: {sessionResult.strengths.join(" • ") || "-"}</p>
                    <p className="mt-1">Improvements: {sessionResult.improvements.join(" • ") || "-"}</p>
                  </div>
                </section>
              ) : null}
            </aside>
          </div>
        </>
      )}

      {serverError ? (
        <div className="rounded-xl border border-[var(--accent-danger)]/30 bg-[var(--accent-danger)]/8 px-4 py-2 text-sm text-[var(--accent-danger)]">{serverError}</div>
      ) : null}

      {recordingError ? (
        <div className="rounded-xl border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/8 px-4 py-2 text-sm text-[var(--accent-warning)]">{recordingError}</div>
      ) : null}

      {realtimeError ? (
        <div className="rounded-xl border border-[var(--accent-warning)]/30 bg-[var(--accent-warning)]/8 px-4 py-2 text-sm text-[var(--accent-warning)]">{realtimeError}</div>
      ) : null}

      {loading ? (
        <div className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Processing...
        </div>
      ) : null}
    </section>
  );
}
