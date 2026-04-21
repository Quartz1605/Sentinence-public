"use client";

import { useMemo, useState } from "react";
import { LoaderCircle, Mic, MicOff, Play, Send, Volume2 } from "lucide-react";

import TalkingAvatar from "@/components/interview/TalkingAvatar";
import { useMeetingRoomRealtimeTranscribe } from "@/app/meeting-room/hooks/useMeetingRoomRealtimeTranscribe";
import {
  getGroupInterviewResult,
  GroupInterviewer,
  GroupInterviewEvaluation,
  GroupInterviewQuestion,
  GroupInterviewStatus,
  startGroupInterview,
  submitGroupInterviewAnswer,
} from "@/lib/groupInterviewApi";

const INTERVIEWER_IMAGE_SETS: Record<string, { closed: string; open: string; wide: string }> = {
  "panel-tech": {
    closed: "/face-1.png",
    open: "/face-2.png",
    wide: "/face-3.png",
  },
  "panel-hr": {
    closed: "/p2-face1.png",
    open: "/p2-face2.png",
    wide: "/p2-face3.png",
  },
  "panel-mixed": {
    closed: "/p3-face1.png",
    open: "/p3-face2.png",
    wide: "/p3-face3.png",
  },
};

type Phase = "setup" | "active" | "completed";

type TurnView = {
  interviewerName: string;
  interviewerTrack: string;
  question: string;
  answer: string;
  evaluation: GroupInterviewEvaluation;
};

export default function GroupInterviewPage() {
  const [phase, setPhase] = useState<Phase>("setup");
  const [role, setRole] = useState("Full Stack Engineer");
  const [difficulty, setDifficulty] = useState("medium");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [status, setStatus] = useState<GroupInterviewStatus>("ongoing");
  const [loading, setLoading] = useState(false);
  const [question, setQuestion] = useState<GroupInterviewQuestion | null>(null);
  const [interviewers, setInterviewers] = useState<GroupInterviewer[]>([]);
  const [progress, setProgress] = useState({ current_turn: 0, total_turns: 0 });
  const [answerText, setAnswerText] = useState("");
  const [turns, setTurns] = useState<TurnView[]>([]);
  const [result, setResult] = useState<{ overall_score: number; summary: string; strengths: string[]; weaknesses: string[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isQuestionAudioPlaying, setIsQuestionAudioPlaying] = useState(false);

  const {
    transcript,
    isStreaming,
    connectionState,
    start: startRealtimeStt,
    stop: stopRealtimeStt,
    clearTranscript,
    error: sttError,
  } = useMeetingRoomRealtimeTranscribe(true);

  const activeInterviewerId = question?.interviewer_id ?? null;

  const questionAudioSrc = question?.audio_data_uri ?? "";

  const transcriptText = transcript.trim();

  const onStart = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await startGroupInterview({ role, difficulty });
      setSessionId(response.session_id);
      setStatus(response.status);
      setInterviewers(response.interviewers);
      setQuestion(response.question);
      setProgress(response.progress);
      setPhase("active");
      setIsQuestionAudioPlaying(Boolean(response.question.audio_data_uri));
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to start group interview");
      }
    } finally {
      setLoading(false);
    }
  };

  const onReplayQuestion = () => {
    setIsQuestionAudioPlaying(false);
    window.setTimeout(() => setIsQuestionAudioPlaying(true), 50);
  };

  const onToggleLiveTranscription = async () => {
    if (isStreaming) {
      await stopRealtimeStt();
      return;
    }
    await startRealtimeStt();
  };

  const onSubmitAnswer = async () => {
    if (!sessionId || !question) {
      return;
    }

    const finalAnswer = answerText.trim() || transcriptText;
    if (!finalAnswer) {
      setError("Provide an answer in text or speak with live transcription enabled.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await submitGroupInterviewAnswer({
        session_id: sessionId,
        answer_text: finalAnswer,
      });

      setStatus(response.status);
      setProgress(response.progress);
      setTurns((prev) => [
        ...prev,
        {
          interviewerName: question.interviewer_name,
          interviewerTrack: question.interviewer_track,
          question: question.question,
          answer: response.transcript,
          evaluation: response.evaluation,
        },
      ]);
      setAnswerText("");
      clearTranscript();

      if (response.next_question) {
        setQuestion(response.next_question);
        setIsQuestionAudioPlaying(Boolean(response.next_question.audio_data_uri));
      } else {
        setQuestion(null);
      }

      if (response.status === "completed") {
        const final = await getGroupInterviewResult(sessionId);
        setResult(final.result);
        setPhase("completed");
      }
    } catch (err: unknown) {
      if (err instanceof Error) {
        setError(err.message);
      } else {
        setError("Failed to submit answer.");
      }
    } finally {
      setLoading(false);
    }
  };

  const progressPct = useMemo(() => {
    if (!progress.total_turns) return 0;
    return Math.round((progress.current_turn / progress.total_turns) * 100);
  }, [progress]);

  return (
    <section className="mx-auto w-full max-w-7xl space-y-5 pb-8">
      <header className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-6 shadow-sm">
        <p className="text-xs uppercase tracking-[0.18em] text-[var(--accent-primary)]">Group Interview</p>
        <h1 className="mt-2 text-3xl font-bold text-[var(--text-primary)]">Three-Panel Interview Simulation</h1>
        <p className="mt-2 text-sm text-[var(--text-secondary)]">
          Tech, HR, and mixed interviewers ask you questions in rotation with full cross-panel context.
        </p>
      </header>

      {phase === "setup" ? (
        <article className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 shadow-sm">
          <div className="grid gap-4 md:grid-cols-3">
            <label className="text-sm text-[var(--text-secondary)]">
              Role
              <input
                value={role}
                onChange={(event) => setRole(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-[var(--text-primary)]"
              />
            </label>
            <label className="text-sm text-[var(--text-secondary)]">
              Difficulty
              <select
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-[var(--text-primary)]"
              >
                <option value="easy">easy</option>
                <option value="medium">medium</option>
                <option value="hard">hard</option>
              </select>
            </label>
            <div className="flex items-end">
              <button
                type="button"
                onClick={onStart}
                disabled={loading}
                className="inline-flex h-10 items-center gap-2 rounded-lg bg-[var(--accent-primary)] px-4 text-sm font-semibold text-white transition hover:bg-[var(--accent-primary)]/90 disabled:opacity-60"
              >
                {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
                Start Group Interview
              </button>
            </div>
          </div>
        </article>
      ) : null}

      {phase !== "setup" ? (
        <>
          <section className="rounded-2xl border border-[var(--border-default)] bg-[#1f232b] p-3">
            <div className="grid gap-2 md:grid-cols-3">
              {interviewers.map((interviewer) => {
                const imageSet = INTERVIEWER_IMAGE_SETS[interviewer.id] ?? INTERVIEWER_IMAGE_SETS["panel-tech"];
                const isActive = interviewer.id === activeInterviewerId;
                return (
                  <article
                    key={interviewer.id}
                    className={`rounded-xl border p-3 ${
                      isActive
                        ? "border-[var(--accent-primary)]/60 bg-[var(--accent-primary)]/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.12em] text-slate-300">{interviewer.track}</p>
                    <p className="mt-1 text-sm font-semibold text-white">{interviewer.name}</p>
                    <div className="mt-2">
                      <TalkingAvatar
                        audioSrc={isActive ? questionAudioSrc : ""}
                        isPlaying={isActive ? isQuestionAudioPlaying : false}
                        faceImages={imageSet}
                      />
                    </div>
                  </article>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 lg:grid-cols-[1fr_340px]">
            <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">Current Question</h2>
                <button
                  type="button"
                  onClick={onReplayQuestion}
                  className="inline-flex items-center gap-1 rounded-lg border border-[var(--border-default)] px-2.5 py-1 text-xs text-[var(--text-secondary)]"
                >
                  <Volume2 className="h-3.5 w-3.5" /> Replay
                </button>
              </div>
              <p className="mt-2 rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]">
                {question?.question ?? "Interview completed"}
              </p>

              <div className="mt-3 space-y-2">
                <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Live transcript</label>
                <textarea
                  value={transcriptText}
                  readOnly
                  className="h-20 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                  placeholder="Start live transcription to see your speech here..."
                />
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onToggleLiveTranscription}
                    className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-semibold ${
                      isStreaming
                        ? "bg-rose-100 text-rose-700"
                        : "bg-[var(--accent-primary)]/15 text-[var(--accent-primary)]"
                    }`}
                  >
                    {isStreaming ? <MicOff className="h-3.5 w-3.5" /> : <Mic className="h-3.5 w-3.5" />}
                    {isStreaming ? "Stop STT" : "Start STT"}
                  </button>
                  <span className="text-xs text-[var(--text-tertiary)]">WS: {connectionState}</span>
                </div>
              </div>

              <div className="mt-3">
                <label className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Answer input</label>
                <textarea
                  value={answerText}
                  onChange={(event) => setAnswerText(event.target.value)}
                  placeholder="Type answer or submit live transcript"
                  className="mt-1 h-24 w-full rounded-lg border border-[var(--border-default)] bg-white px-3 py-2 text-sm text-[var(--text-primary)]"
                />
                <div className="mt-2 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={onSubmitAnswer}
                    disabled={loading || status === "completed"}
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent-success)] px-3 py-2 text-sm font-semibold text-white disabled:opacity-60"
                  >
                    {loading ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                    Submit Response
                  </button>
                </div>
              </div>
            </article>

            <aside className="space-y-3">
              <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Progress</p>
                <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">
                  {progress.current_turn}/{progress.total_turns}
                </p>
                <div className="mt-2 h-2 rounded-full bg-[var(--surface-secondary)]">
                  <div className="h-2 rounded-full bg-[var(--accent-primary)]" style={{ width: `${progressPct}%` }} />
                </div>
              </article>

              {result ? (
                <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
                  <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Result</p>
                  <p className="mt-1 text-2xl font-bold text-[var(--text-primary)]">{result.overall_score}/100</p>
                  <p className="mt-2 text-sm text-[var(--text-secondary)]">{result.summary}</p>
                </article>
              ) : null}
            </aside>
          </section>

          <section className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-4 shadow-sm">
            <h3 className="text-sm font-semibold text-[var(--text-primary)]">Turn History</h3>
            <div className="mt-2 space-y-2">
              {turns.map((turn, index) => (
                <article key={`${turn.interviewerName}-${index}`} className="rounded-lg border border-[var(--border-default)] bg-white p-3">
                  <p className="text-xs uppercase tracking-[0.1em] text-[var(--text-tertiary)]">
                    {turn.interviewerName} • {turn.interviewerTrack}
                  </p>
                  <p className="mt-1 text-sm text-[var(--text-primary)]">Q: {turn.question}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">A: {turn.answer}</p>
                  <p className="mt-1 text-xs text-[var(--accent-primary)]">Score: {turn.evaluation.score}/10</p>
                </article>
              ))}
            </div>
          </section>
        </>
      ) : null}

      {error ? <p className="rounded-lg border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}
      {sttError ? <p className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-700">{sttError}</p> : null}
    </section>
  );
}
