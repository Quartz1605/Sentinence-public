"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  getInterviewDetails,
  type InterviewDetailResponse,
  type SessionAnalysisData,
} from "@/lib/interviewAgentApi";
import {
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Clock,
  Target,
  TrendingUp,
  TrendingDown,
  LoaderCircle,
  Bot,
  BarChart3,
  MessageSquare,
  AlertTriangle,
  Eye,
  Activity,
  Frown,
  FileText,
} from "lucide-react";

// ── Inline Radar/Triangle Chart Component ──────────────────────────
function CategoryRadar({
  data,
}: {
  data: { label: string; value: number; color: string }[];
}) {
  const size = 280;
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2 - 40;
  const levels = 4;

  const n = data.length;
  const angleSlice = (2 * Math.PI) / n;

  // Grid circles
  const gridCircles = Array.from({ length: levels }, (_, i) => {
    const r = (maxR / levels) * (i + 1);
    return (
      <circle
        key={i}
        cx={cx}
        cy={cy}
        r={r}
        fill="none"
        stroke="var(--border-default)"
        strokeWidth="1"
        opacity={0.6}
      />
    );
  });

  // Axis lines
  const axisLines = data.map((_, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const x2 = cx + maxR * Math.cos(angle);
    const y2 = cy + maxR * Math.sin(angle);
    return (
      <line
        key={i}
        x1={cx}
        y1={cy}
        x2={x2}
        y2={y2}
        stroke="var(--border-default)"
        strokeWidth="1"
        opacity={0.4}
      />
    );
  });

  // Data polygon
  const points = data
    .map((d, i) => {
      const angle = angleSlice * i - Math.PI / 2;
      const r = (d.value / 100) * maxR;
      const x = cx + r * Math.cos(angle);
      const y = cy + r * Math.sin(angle);
      return `${x},${y}`;
    })
    .join(" ");

  // Labels
  const labels = data.map((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const labelR = maxR + 24;
    const x = cx + labelR * Math.cos(angle);
    const y = cy + labelR * Math.sin(angle);
    return (
      <g key={i}>
        <text
          x={x}
          y={y}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[11px] font-semibold"
          fill="var(--text-secondary)"
        >
          {d.label}
        </text>
        <text
          x={x}
          y={y + 14}
          textAnchor="middle"
          dominantBaseline="central"
          className="text-[10px] font-bold"
          fill={d.color}
        >
          {d.value}%
        </text>
      </g>
    );
  });

  // Data dots
  const dots = data.map((d, i) => {
    const angle = angleSlice * i - Math.PI / 2;
    const r = (d.value / 100) * maxR;
    const x = cx + r * Math.cos(angle);
    const y = cy + r * Math.sin(angle);
    return (
      <circle
        key={i}
        cx={x}
        cy={y}
        r={4}
        fill={d.color}
        stroke="white"
        strokeWidth={2}
      />
    );
  });

  return (
    <svg width={size} height={size} className="mx-auto">
      {gridCircles}
      {axisLines}
      <polygon
        points={points}
        fill="var(--accent-primary)"
        fillOpacity={0.15}
        stroke="var(--accent-primary)"
        strokeWidth={2}
        strokeLinejoin="round"
      />
      {dots}
      {labels}
    </svg>
  );
}

// ── Score Bar Component (light theme) ──────────────────────────
function AnalysisScoreBar({
  label,
  score,
  color,
}: {
  label: string;
  score: number;
  color: string;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between items-center">
        <span className="text-sm font-medium text-[var(--text-secondary)]">{label}</span>
        <span className="text-sm font-bold text-[var(--text-primary)]">{score}%</span>
      </div>
      <div className="h-2 w-full bg-[var(--surface-tertiary)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000"
          style={{ width: `${score}%`, background: color }}
        />
      </div>
    </div>
  );
}

function formatPersonaLabel(persona: string): string {
  const normalized = (persona || "")
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");

  if (normalized === "devils advocate" || normalized === "devil advocate") {
    return "Devil's Advocate";
  }

  return normalized
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export default function InterviewAnalysisPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const interviewId = searchParams.get("id");

  const [data, setData] = useState<InterviewDetailResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!interviewId) {
      setError("No interview ID provided.");
      setLoading(false);
      return;
    }

    async function load() {
      try {
        const result = await getInterviewDetails(interviewId!);
        setData(result);
      } catch (err: any) {
        const detail = err?.response?.data?.detail ?? "Failed to load interview details.";
        setError(detail);
      } finally {
        setLoading(false);
      }
    }

    load();
  }, [interviewId]);

  if (loading) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center space-y-4">
        <LoaderCircle className="w-8 h-8 text-[var(--accent-primary)] animate-spin" />
        <p className="text-sm text-[var(--text-secondary)]">Loading interview analysis...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-2xl mt-20 text-center space-y-4">
        <AlertTriangle className="w-12 h-12 text-[var(--accent-warning)] mx-auto" />
        <h2 className="text-xl font-bold text-[var(--text-primary)]">Unable to Load Analysis</h2>
        <p className="text-sm text-[var(--text-secondary)]">{error || "Unknown error"}</p>
        <button
          onClick={() => router.push("/interview")}
          className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-6 py-2.5 text-sm font-semibold text-white hover:bg-[var(--accent-primary)]/90 transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Interview
        </button>
      </div>
    );
  }

  const { interview, responses } = data;
  const sessionAnalysis: SessionAnalysisData | null | undefined = interview.session_analysis;
  const scores = responses.map((r) => r.score ?? 0);
  const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) : 0;
  const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
  const minScore = scores.length > 0 ? Math.min(...scores) : 0;
  const totalStrengths = responses.reduce((acc, r) => acc + (r.strengths?.length ?? 0), 0);
  const totalWeaknesses = responses.reduce((acc, r) => acc + (r.weaknesses?.length ?? 0), 0);

  // Compute radar data
  const confidence = sessionAnalysis?.confidence ?? avgScore;
  const clarity = sessionAnalysis?.clarity ?? avgScore;
  const nervousness = sessionAnalysis?.nervousness ?? 30;
  const posture = sessionAnalysis?.posture_score ?? 70;
  const gaze = sessionAnalysis?.gaze_score ?? 70;

  const radarData = [
    { label: "Confidence", value: Math.min(100, Math.max(0, confidence)), color: "#10b981" },
    { label: "Clarity", value: Math.min(100, Math.max(0, clarity)), color: "#6366f1" },
    { label: "Composure", value: Math.min(100, Math.max(0, 100 - nervousness)), color: "#f59e0b" },
    { label: "Posture", value: Math.min(100, Math.max(0, posture)), color: "#8b5cf6" },
    { label: "Eye Contact", value: Math.min(100, Math.max(0, gaze)), color: "#06b6d4" },
  ];

  function scoreColor(score: number): string {
    if (score >= 8) return "var(--accent-success)";
    if (score >= 5) return "var(--accent-primary)";
    return "var(--accent-warning)";
  }

  function scoreBg(score: number): string {
    if (score >= 8) return "bg-[var(--accent-success)]/10 text-[var(--accent-success)]";
    if (score >= 5) return "bg-[var(--accent-primary)]/10 text-[var(--accent-primary)]";
    return "bg-[var(--accent-warning)]/10 text-[var(--accent-warning)]";
  }

  return (
    <div className="mx-auto max-w-6xl space-y-7 pb-12">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <button
            onClick={() => router.push("/interview")}
            className="mb-3 flex items-center gap-1 text-sm text-[var(--text-tertiary)] hover:text-[var(--text-primary)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Interview
          </button>
          <div className="flex items-center gap-2">
            <Bot className="w-6 h-6 text-[var(--accent-primary)]" />
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
              Interview Analysis
            </h1>
          </div>
          <p className="text-[var(--text-secondary)] mt-1.5 text-sm">
            {interview.role} · {interview.difficulty} difficulty · {formatPersonaLabel(interview.persona)} persona
          </p>
          <p className="text-xs text-[var(--text-tertiary)] mt-1">
            {new Date(interview.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
            {sessionAnalysis?.duration_seconds && (
              <> · Duration: {Math.floor(sessionAnalysis.duration_seconds / 60)}m {sessionAnalysis.duration_seconds % 60}s</>
            )}
          </p>
        </div>
        <div className="text-right">
          <div className="text-5xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)]">
            {avgScore}%
          </div>
          <p className="text-sm text-[var(--text-tertiary)] font-medium mt-1">Overall Score</p>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard icon={<MessageSquare className="w-5 h-5" />} label="Questions" value={`${responses.length}`} color="var(--accent-primary)" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Best Score" value={`${maxScore}/10`} color="var(--accent-success)" />
        <StatCard icon={<TrendingDown className="w-5 h-5" />} label="Lowest Score" value={`${minScore}/10`} color="var(--accent-warning)" />
        <StatCard icon={<BarChart3 className="w-5 h-5" />} label="Avg Score" value={`${(scores.reduce((a, b) => a + b, 0) / Math.max(scores.length, 1)).toFixed(1)}/10`} color="var(--accent-primary)" />
      </div>

      {/* Category Radar + Score Bars */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Radar Chart */}
        <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-[var(--accent-primary)]" />
            Performance Radar
          </h2>
          <CategoryRadar data={radarData} />
        </div>

        {/* Score Bars + Video Metrics */}
        <div className="lg:col-span-2 space-y-5">
          <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-6 shadow-sm">
            <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
              <Target className="w-4 h-4 text-[var(--accent-primary)]" />
              Behavioral Metrics
            </h2>
            <div className="space-y-4">
              <AnalysisScoreBar label="Confidence" score={confidence} color="#10b981" />
              <AnalysisScoreBar label="Clarity" score={clarity} color="#6366f1" />
              <AnalysisScoreBar label="Nervousness" score={nervousness} color="#f59e0b" />
              {sessionAnalysis?.posture_score != null && (
                <AnalysisScoreBar label="Posture" score={posture} color="#8b5cf6" />
              )}
              {sessionAnalysis?.gaze_score != null && (
                <AnalysisScoreBar label="Eye Contact" score={gaze} color="#06b6d4" />
              )}
              {sessionAnalysis?.fidgeting_score != null && (
                <AnalysisScoreBar label="Composure (low fidgeting)" score={sessionAnalysis.fidgeting_score} color="#ec4899" />
              )}
            </div>
          </div>

          {/* Emotion + Answer Quality */}
          <div className="grid grid-cols-2 gap-4">
            {sessionAnalysis?.dominant_emotion && (
              <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-[var(--text-tertiary)]">Dominant Emotion</p>
                    <p className="text-xl font-bold text-[var(--text-primary)] mt-1 capitalize">
                      {sessionAnalysis.dominant_emotion}
                    </p>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/8 flex items-center justify-center">
                    <Frown className="w-5 h-5 text-[var(--accent-primary)]" />
                  </div>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-5 shadow-sm">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-[var(--text-tertiary)]">Answer Quality</p>
                  <p className="text-xl font-bold text-[var(--text-primary)] mt-1">
                    {avgScore}%
                  </p>
                </div>
                <div className="w-10 h-10 rounded-full bg-[var(--accent-primary)]/8 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-[var(--accent-primary)]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Voice Analysis Summary (if available) */}
      {sessionAnalysis?.voice_summary && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--accent-primary)]/5 to-transparent">
            <div className="flex items-center gap-2">
              <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">Voice & Behavioral Summary</h3>
            </div>
          </div>
          <div className="px-6 py-5">
            <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
              {sessionAnalysis.voice_summary}
            </p>
          </div>
          {sessionAnalysis.key_moments && sessionAnalysis.key_moments.length > 0 && (
            <div className="px-6 pb-6">
              <div className="border-t border-[var(--border-default)] pt-4">
                <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" />
                  Key Moments
                </h4>
                <ul className="space-y-3">
                  {sessionAnalysis.key_moments.map((km, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-sm">
                      <span className="shrink-0 rounded-md bg-[var(--accent-primary)]/8 px-2 py-0.5 text-xs font-mono font-semibold text-[var(--accent-primary)]">
                        {km.time}
                      </span>
                      <span className="text-[var(--text-secondary)] leading-relaxed">
                        {km.description}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Timestamp Timelines */}
      {(sessionAnalysis?.video_timeline?.length || sessionAnalysis?.voice_timeline?.length) && (
        <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--accent-secondary)]/8 to-transparent">
            <div className="flex items-center gap-2">
              <Eye className="w-5 h-5 text-[var(--accent-secondary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">Timestamp Timeline Mapping</h3>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Video Timeline ({sessionAnalysis?.video_timeline?.length ?? 0})
              </h4>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {(sessionAnalysis?.video_timeline ?? []).slice(0, 40).map((item, idx) => (
                  <div key={`video-${idx}`} className="rounded-lg border border-[var(--border-default)] px-3 py-2 bg-[var(--surface-secondary)]/65">
                    <p className="text-xs font-mono text-[var(--accent-secondary)]">{Math.round(item.timestamp)}s</p>
                    <p className="text-xs font-medium text-[var(--text-primary)] capitalize">{item.label ?? "n/a"}</p>
                  </div>
                ))}
                {(sessionAnalysis?.video_timeline?.length ?? 0) === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] italic">No video timeline data saved.</p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-tertiary)]">
                Voice Timeline ({sessionAnalysis?.voice_timeline?.length ?? 0})
              </h4>
              <div className="max-h-56 overflow-y-auto space-y-2 pr-1">
                {(sessionAnalysis?.voice_timeline ?? []).slice(0, 40).map((item, idx) => (
                  <div key={`voice-${idx}`} className="rounded-lg border border-[var(--border-default)] px-3 py-2 bg-[var(--surface-secondary)]/65">
                    <p className="text-xs font-mono text-[var(--accent-primary)]">{Math.round(item.timestamp)}s</p>
                    <p className="text-xs font-medium text-[var(--text-primary)] capitalize">{item.label ?? "n/a"}</p>
                    {typeof item.payload?.insight === "string" && (
                      <p className="mt-1 text-xs text-[var(--text-secondary)] leading-relaxed">{item.payload.insight}</p>
                    )}
                  </div>
                ))}
                {(sessionAnalysis?.voice_timeline?.length ?? 0) === 0 && (
                  <p className="text-sm text-[var(--text-tertiary)] italic">No voice timeline data saved.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Score Progression */}
      <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-[var(--text-primary)] mb-4 flex items-center gap-2">
          <Target className="w-4 h-4 text-[var(--accent-primary)]" />
          Score Progression
        </h2>
        <div className="flex items-end gap-2 h-32">
          {responses.map((r, i) => {
            const score = r.score ?? 0;
            const heightPercent = (score / 10) * 100;
            return (
              <div key={i} className="flex-1 flex flex-col items-center gap-1">
                <span className="text-[10px] font-bold" style={{ color: scoreColor(score) }}>
                  {score}
                </span>
                <div
                  className="w-full rounded-t-lg transition-all duration-500"
                  style={{
                    height: `${heightPercent}%`,
                    background: `linear-gradient(to top, ${scoreColor(score)}33, ${scoreColor(score)})`,
                    minHeight: "4px",
                  }}
                />
                <span className="text-[9px] text-[var(--text-tertiary)] font-medium">Q{i + 1}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Strengths & Weaknesses Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="rounded-2xl border border-[var(--accent-success)]/15 bg-[var(--accent-success)]/3 p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-[var(--accent-success)] mb-3">
            <CheckCircle2 className="w-4 h-4" />
            All Strengths ({totalStrengths})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {responses.flatMap((r, qi) =>
              (r.strengths ?? []).map((s, si) => (
                <div key={`${qi}-${si}`} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-success)] mt-1.5 shrink-0" />
                  <span>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">Q{qi + 1}:</span> {s}
                  </span>
                </div>
              ))
            )}
            {totalStrengths === 0 && (
              <p className="text-sm text-[var(--text-tertiary)] italic">No strengths recorded.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--accent-warning)]/15 bg-[var(--accent-warning)]/3 p-5">
          <h3 className="text-sm font-semibold flex items-center gap-2 text-amber-600 mb-3">
            <AlertCircle className="w-4 h-4" />
            Areas to Improve ({totalWeaknesses})
          </h3>
          <div className="space-y-2 max-h-48 overflow-y-auto">
            {responses.flatMap((r, qi) =>
              (r.weaknesses ?? []).map((w, wi) => (
                <div key={`${qi}-${wi}`} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mt-1.5 shrink-0" />
                  <span>
                    <span className="text-xs font-medium text-[var(--text-tertiary)]">Q{qi + 1}:</span> {w}
                  </span>
                </div>
              ))
            )}
            {totalWeaknesses === 0 && (
              <p className="text-sm text-[var(--text-tertiary)] italic">No weaknesses recorded.</p>
            )}
          </div>
        </div>
      </div>

      {/* Question-by-Question Detail */}
      <div className="space-y-5">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-[var(--accent-primary)]" />
          Question-by-Question Breakdown
        </h2>

        {responses.map((response, index) => {
          const score = response.score ?? 0;
          const contradiction = response.contradiction_analysis as any;

          return (
            <div key={response.id} className="rounded-2xl border border-[var(--border-default)] bg-white/90 shadow-sm overflow-hidden">
              {/* Question Header */}
              <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                    style={{ background: scoreColor(score) }}
                  >
                    Q{index + 1}
                  </div>
                  <span className={`text-sm font-bold px-2.5 py-0.5 rounded-full ${scoreBg(score)}`}>
                    {score}/10
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-[var(--text-tertiary)]">
                  <Clock className="w-3 h-3" />
                  {new Date(response.created_at).toLocaleTimeString("en-US", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              </div>

              <div className="p-5 space-y-4">
                {/* Question */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-primary)] mb-1">Question</p>
                  <p className="text-sm font-medium text-[var(--text-primary)] leading-relaxed">{response.question}</p>
                </div>

                {/* Answer */}
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">Your Answer</p>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed bg-[var(--surface-secondary)] rounded-xl px-4 py-3 border border-[var(--border-subtle)]">
                    {response.answer}
                  </p>
                </div>

                {/* Feedback */}
                {response.feedback && (
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">AI Feedback</p>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{response.feedback}</p>
                  </div>
                )}

                {/* Strengths & Weaknesses */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {response.strengths && response.strengths.length > 0 && (
                    <div className="rounded-xl bg-[var(--accent-success)]/5 border border-[var(--accent-success)]/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-success)] mb-2 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />
                        Strengths
                      </p>
                      <div className="space-y-1">
                        {response.strengths.map((s, i) => (
                          <p key={i} className="text-xs text-[var(--text-secondary)]">• {s}</p>
                        ))}
                      </div>
                    </div>
                  )}

                  {response.weaknesses && response.weaknesses.length > 0 && (
                    <div className="rounded-xl bg-[var(--accent-warning)]/5 border border-[var(--accent-warning)]/10 p-3">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-600 mb-2 flex items-center gap-1">
                        <AlertCircle className="w-3 h-3" />
                        Areas to Improve
                      </p>
                      <div className="space-y-1">
                        {response.weaknesses.map((w, i) => (
                          <p key={i} className="text-xs text-[var(--text-secondary)]">• {w}</p>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Contradiction Analysis */}
                {contradiction && contradiction.contradiction && (
                  <div className="rounded-xl bg-[var(--accent-danger)]/5 border border-[var(--accent-danger)]/15 p-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--accent-danger)] mb-2 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Contradiction Detected — {contradiction.severity} severity
                    </p>
                    <div className="space-y-1 text-xs text-[var(--text-secondary)]">
                      <p><span className="font-medium">Topic:</span> {contradiction.topic}</p>
                      <p><span className="font-medium">Previous claim:</span> {contradiction.previous_claim}</p>
                      <p><span className="font-medium">Current claim:</span> {contradiction.current_claim}</p>
                      <p><span className="font-medium">Explanation:</span> {contradiction.explanation}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom CTA */}
      <div className="flex justify-center gap-3 pt-4">
        <button
          onClick={() => router.push("/interview")}
          className="flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white/80 px-6 py-3 text-sm font-medium text-[var(--text-secondary)] hover:bg-white hover:text-[var(--accent-primary)] transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          New Interview
        </button>
        <button
          onClick={() => router.push("/dashboard")}
          className="flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-6 py-3 text-sm font-semibold text-white hover:bg-[var(--accent-primary)]/90 transition-all"
        >
          <BarChart3 className="w-4 h-4" />
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

// ── Stat Card Component ──
function StatCard({
  icon,
  label,
  value,
  color,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-medium text-[var(--text-tertiary)]">{label}</p>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${color}15`, color }}>
          {icon}
        </div>
      </div>
      <p className="text-2xl font-bold text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
