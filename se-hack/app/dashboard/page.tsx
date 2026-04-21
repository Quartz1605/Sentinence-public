import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  FileText,
  Mic,
  Quote,
  Sparkles,
  Target,
  TrendingUp,
  Upload,
  Users,
} from "lucide-react";

import { getCurrentUser } from "@/lib/auth";
import SentenoiLauncher from "@/components/voice/sentenoi-launcher";

const backendBaseUrl =
  process.env.BACKEND_URL ?? process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:8000";
const VAPI_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY ?? "";
const VAPI_ASSISTANT_ID = "";

type ResultsOverview = {
  total_sessions: number;
  completed_sessions: number;
  total_answers: number;
  avg_score: number;
  improvement_delta: number;
  contradiction_rate: number;
};

type CommunicationTrendPoint = {
  confidence: number | null;
  clarity: number | null;
  nervousness: number | null;
};

type SessionSnapshot = {
  session_id: string;
  role: string;
  difficulty: string;
  status: string;
  date: string;
  question_count: number;
  avg_score: number | null;
  contradictions: number;
  top_strengths: string[];
  top_weaknesses: string[];
};

type ResultsAnalysisResponse = {
  generated_at: string;
  overview: ResultsOverview;
  communication_trend: CommunicationTrendPoint[];
  session_snapshots: SessionSnapshot[];
  weaknesses: Array<{
    area: string;
    suggested_actions: string[];
  }>;
  llm_insights: {
    summary: string;
    trajectory: string;
    key_weaknesses: Array<{
      area: string;
      impact_score: number;
      action_items: string[];
    }>;
    key_strengths: Array<{
      area: string;
      rationale: string;
    }>;
  };
};

type CurrentResumeResponse = {
  ats_analysis?: {
    overall_score: number | null;
    wording_tips: string[];
    formatting_tips: string[];
    useful_insights: string[];
  } | null;
};

type FocusItem = {
  area: string;
  nextStep: string;
};

type WeeklyStats = {
  currentCount: number;
  previousCount: number;
  currentAvg: number | null;
  previousAvg: number | null;
};

const MOTIVATIONAL_QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Believe you can and you are halfway there.", author: "Theodore Roosevelt" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Your limitation is only your imagination.", author: "Unknown" },
  { text: "Great things never come from comfort zones.", author: "Ben Francia" },
  { text: "The harder you work for something, the greater you will feel when you achieve it.", author: "Unknown" },
  { text: "Do not watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "Everything you have ever wanted is on the other side of fear.", author: "George Addair" },
];

function getDailyQuote() {
  const today = new Date();
  const dayOfYear = Math.floor(
    (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86400000,
  );
  return MOTIVATIONAL_QUOTES[dayOfYear % MOTIVATIONAL_QUOTES.length];
}

function deriveDisplayName(name: string | null, email: string): string {
  if (name && name.trim()) {
    return name.split(" ")[0];
  }
  const localPart = email.split("@")[0] ?? "there";
  return localPart.charAt(0).toUpperCase() + localPart.slice(1);
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function parseSnapshotDate(rawDate: string): Date | null {
  if (!rawDate || !rawDate.trim()) {
    return null;
  }

  const isoDate = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? `${rawDate}T00:00:00` : rawDate;
  const parsed = new Date(isoDate);

  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed;
}

function getStartOfWeek(date: Date): Date {
  const normalized = new Date(date);
  normalized.setHours(0, 0, 0, 0);

  const dayIndex = (normalized.getDay() + 6) % 7;
  normalized.setDate(normalized.getDate() - dayIndex);
  return normalized;
}

function mean(values: Array<number | null | undefined>): number | null {
  const numeric = values.filter((value): value is number => typeof value === "number");
  if (numeric.length === 0) {
    return null;
  }

  return numeric.reduce((acc, value) => acc + value, 0) / numeric.length;
}

function computeWeeklyStats(snapshots: SessionSnapshot[]): WeeklyStats {
  const currentWeek: SessionSnapshot[] = [];
  const previousWeek: SessionSnapshot[] = [];

  const now = new Date();
  const currentWeekStart = getStartOfWeek(now);
  const previousWeekStart = new Date(currentWeekStart);
  previousWeekStart.setDate(previousWeekStart.getDate() - 7);

  for (const snapshot of snapshots) {
    const parsed = parseSnapshotDate(snapshot.date);
    if (!parsed) {
      continue;
    }

    if (parsed >= currentWeekStart) {
      currentWeek.push(snapshot);
      continue;
    }

    if (parsed >= previousWeekStart && parsed < currentWeekStart) {
      previousWeek.push(snapshot);
    }
  }

  return {
    currentCount: currentWeek.length,
    previousCount: previousWeek.length,
    currentAvg: mean(currentWeek.map((item) => item.avg_score)),
    previousAvg: mean(previousWeek.map((item) => item.avg_score)),
  };
}

function computeReadiness(
  avgInterviewScore: number,
  contradictionRate: number,
  atsScore: number | null,
): number {
  const safeAvg = clampPercent(avgInterviewScore);
  const safeContradiction = clampPercent(contradictionRate);

  if (typeof atsScore === "number") {
    const safeAts = clampPercent(atsScore);
    return Math.round(clampPercent(0.45 * safeAvg + 0.35 * safeAts + 0.2 * (100 - safeContradiction)));
  }

  return Math.round(clampPercent(0.65 * safeAvg + 0.35 * (100 - safeContradiction)));
}

function formatPercent(value: number | null | undefined, fallback = "N/A"): string {
  if (typeof value !== "number") {
    return fallback;
  }
  return `${value.toFixed(1)}%`;
}

function formatDate(value: string | null | undefined): string {
  if (!value) {
    return "N/A";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

async function fetchBackendData<T>(path: string, options?: { allowNotFound?: boolean }): Promise<T | null> {
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  if (!cookieHeader) {
    return null;
  }

  try {
    const response = await fetch(`${backendBaseUrl}${path}`, {
      headers: {
        Cookie: cookieHeader,
      },
      cache: "no-store",
    });

    if (options?.allowNotFound && response.status === 404) {
      return null;
    }

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as T;
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/");
  }

  const displayName = deriveDisplayName(user.name, user.email);
  const quote = getDailyQuote();

  const [results, resume] = await Promise.all([
    fetchBackendData<ResultsAnalysisResponse>("/results/analysis"),
    fetchBackendData<CurrentResumeResponse>("/resume", { allowNotFound: true }),
  ]);

  const overview = results?.overview;
  const snapshotList = results?.session_snapshots ?? [];
  const latestSnapshot = [...snapshotList]
    .sort((left, right) => {
      const leftTime = parseSnapshotDate(left.date)?.getTime() ?? 0;
      const rightTime = parseSnapshotDate(right.date)?.getTime() ?? 0;
      return leftTime - rightTime;
    })
    .at(-1);

  const weeklyStats = computeWeeklyStats(snapshotList);
  const weeklyDeltaCount = weeklyStats.currentCount - weeklyStats.previousCount;
  const weeklyDeltaAvg =
    typeof weeklyStats.currentAvg === "number" && typeof weeklyStats.previousAvg === "number"
      ? weeklyStats.currentAvg - weeklyStats.previousAvg
      : null;

  const atsScore = resume?.ats_analysis?.overall_score ?? null;
  const readinessScore = computeReadiness(
    overview?.avg_score ?? 0,
    overview?.contradiction_rate ?? 0,
    atsScore,
  );
  const hasAnySignals = (overview?.total_sessions ?? 0) > 0 || typeof atsScore === "number";

  const contradictionRate = overview?.contradiction_rate ?? 0;
  const contradictionRisk =
    contradictionRate >= 20 ? "High" : contradictionRate >= 10 ? "Moderate" : "Low";

  const topWeaknesses: FocusItem[] =
    results?.llm_insights.key_weaknesses?.length
      ? results.llm_insights.key_weaknesses.slice(0, 3).map((item) => ({
          area: item.area,
          nextStep: item.action_items[0] ?? "Practice concise structured responses for this area.",
        }))
      : (results?.weaknesses ?? []).slice(0, 3).map((item) => ({
          area: item.area,
          nextStep: item.suggested_actions[0] ?? "Practice this topic with one timed answer today.",
        }));

  const topStrengths = (results?.llm_insights.key_strengths ?? []).slice(0, 3);
  const latestCommunication = results?.communication_trend.at(-1);

  const wordingTip = resume?.ats_analysis?.wording_tips?.[0] ?? null;
  const formattingTip = resume?.ats_analysis?.formatting_tips?.[0] ?? null;

  const warmupPrompt =
    topWeaknesses.length > 0
      ? `Give a 90-second answer that improves "${topWeaknesses[0].area}" and ends with a measurable outcome.`
      : "Tell me about a project where you improved performance under a tight deadline with measurable impact.";

  return (
    <section className="mx-auto max-w-6xl space-y-7">
      <header className="rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-white to-[var(--surface-secondary)] p-7 sm:p-9 shadow-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent-primary)]">
          Dashboard
        </p>
        <h1 className="mt-4 text-3xl font-bold leading-tight text-[var(--text-primary)] sm:text-5xl">
          Welcome back, {displayName}
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
          Your control center is live. Track readiness, fix top weaknesses, and jump straight into
          the next best action.
        </p>
        <p className="mt-3 text-xs text-[var(--text-tertiary)]">
          Analytics refreshed: {formatDate(results?.generated_at ?? null)}
        </p>
        <div className="mt-6 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href="/interview-agent"
            className="inline-flex items-center gap-2 rounded-xl bg-[var(--accent-primary)] px-4 py-2 font-medium text-white transition hover:bg-[var(--accent-primary)]/90"
          >
            Start Interview
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            href="/results"
            className="inline-flex items-center gap-2 rounded-xl border border-[var(--border-default)] bg-white px-4 py-2 font-medium text-[var(--text-primary)] transition hover:border-[var(--accent-primary)]/25"
          >
            Open Full Analytics
            <BarChart3 className="h-4 w-4" />
          </Link>
        </div>
      </header>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-2xl border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-primary)]">
            Readiness Index
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
            {hasAnySignals ? `${readinessScore}/100` : "N/A"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            Combined from interview score, ATS score, and contradiction risk.
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
            Progress This Week
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{weeklyStats.currentCount}</p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            Sessions: {weeklyDeltaCount > 0 ? "+" : ""}
            {weeklyDeltaCount} vs last week
            {typeof weeklyDeltaAvg === "number"
              ? ` · Avg score ${weeklyDeltaAvg >= 0 ? "+" : ""}${weeklyDeltaAvg.toFixed(1)}%`
              : ""}
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
            Resume ATS Health
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
            {typeof atsScore === "number" ? `${atsScore}/100` : "Not available"}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            {typeof atsScore === "number"
              ? "Use wording and formatting tips below to improve screening success."
              : "Upload your resume to unlock ATS score and optimization tips."}
          </p>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-white/80 p-5 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--text-tertiary)]">
            Contradiction Risk
          </p>
          <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
            {formatPercent(overview?.contradiction_rate ?? null)}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
            Risk band: {contradictionRisk}. Lower is better.
          </p>
        </article>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--accent-primary)]">
            <Target className="h-4 w-4" />
            <p className="text-sm font-semibold">Top 3 Focus Areas</p>
          </div>
          <div className="mt-4 space-y-3">
            {topWeaknesses.length > 0 ? (
              topWeaknesses.map((item) => (
                <div
                  key={item.area}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3"
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.area}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{item.nextStep}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Complete at least one interview to get personalized weakness priorities.
              </p>
            )}
          </div>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--accent-secondary)]">
            <TrendingUp className="h-4 w-4" />
            <p className="text-sm font-semibold">Last Session Recap</p>
          </div>
          {latestSnapshot ? (
            <div className="mt-4 space-y-3 text-sm text-[var(--text-secondary)]">
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Role:</span> {latestSnapshot.role}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Date:</span> {formatDate(latestSnapshot.date)}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Score:</span>{" "}
                {typeof latestSnapshot.avg_score === "number"
                  ? `${latestSnapshot.avg_score.toFixed(1)}%`
                  : "Not scored"}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Weakest Theme:</span>{" "}
                {latestSnapshot.top_weaknesses[0] ?? "Not enough data"}
              </p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Contradictions:</span>{" "}
                {latestSnapshot.contradictions}
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-[var(--text-secondary)]">
              No interview recap yet. Start one session to populate this card.
            </p>
          )}

          <div className="mt-4 grid grid-cols-3 gap-2">
            <MetricChip label="Confidence" value={latestCommunication?.confidence} />
            <MetricChip label="Clarity" value={latestCommunication?.clarity} />
            <MetricChip label="Composure" value={latestCommunication?.nervousness} inverse />
          </div>
        </article>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--accent-success)]/20 bg-[var(--accent-success)]/5 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--accent-success)]">
            <FileText className="h-4 w-4" />
            <p className="text-sm font-semibold">Resume ATS Optimizer</p>
          </div>

          {typeof atsScore === "number" ? (
            <>
              <p className="mt-3 text-2xl font-bold text-[var(--text-primary)]">ATS Score: {atsScore}/100</p>
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  Wording Tip
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {wordingTip ?? "No wording tip available yet."}
                </p>
              </div>

              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--text-tertiary)]">
                  Formatting Tip
                </p>
                <p className="text-sm text-[var(--text-secondary)]">
                  {formattingTip ?? "No formatting tip available yet."}
                </p>
              </div>
            </>
          ) : (
            <div className="mt-4 rounded-xl border border-[var(--border-default)] bg-white/80 p-4 text-sm text-[var(--text-secondary)]">
              Upload your resume to unlock ATS scoring, wording improvements, and formatting guidance.
            </div>
          )}

          <Link
            href="/resume"
            className="mt-5 inline-flex items-center gap-2 rounded-lg bg-white px-3.5 py-2 text-sm font-medium text-[var(--text-primary)] ring-1 ring-[var(--border-default)] hover:ring-[var(--accent-success)]/25"
          >
            {typeof atsScore === "number" ? "Improve Resume" : "Upload Resume"}
            <Upload className="h-4 w-4" />
          </Link>
        </article>

        <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--accent-primary)]">
            <Sparkles className="h-4 w-4" />
            <p className="text-sm font-semibold">Quick Actions</p>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <ActionLink
              href="/interview-agent"
              title="Interview Practice"
              subtitle="Adaptive AI questions"
              icon={<Mic className="h-4 w-4" />}
            />
            <ActionLink
              href="/meeting-room"
              title="Team Meeting"
              subtitle="Simulate collaboration"
              icon={<Users className="h-4 w-4" />}
            />
            <ActionLink
              href="/results"
              title="Deep Analytics"
              subtitle="Charts and coaching plan"
              icon={<BarChart3 className="h-4 w-4" />}
            />
            <ActionLink
              href="/resume"
              title="Resume Health"
              subtitle="ATS wording and format"
              icon={<FileText className="h-4 w-4" />}
            />
          </div>

          <div className="mt-4 rounded-xl border border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--accent-primary)]">
              Suggested Next Move
            </p>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">
              {(overview?.total_sessions ?? 0) === 0
                ? "Start your first interview session to generate personalized analytics."
                : typeof atsScore !== "number"
                  ? "Upload your resume so the dashboard can include ATS readiness in your score."
                  : contradictionRate >= 20
                    ? "Run one focused interview and prioritize consistency between answers."
                    : "Run one targeted practice interview to improve your top weakness today."}
            </p>
          </div>
        </article>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-2xl border border-[var(--border-default)] bg-white/85 p-6 shadow-sm">
          <div className="flex items-center gap-2 text-[var(--accent-success)]">
            <CheckCircle2 className="h-4 w-4" />
            <p className="text-sm font-semibold">Strengths To Leverage</p>
          </div>
          <div className="mt-4 space-y-3">
            {topStrengths.length > 0 ? (
              topStrengths.map((item) => (
                <div
                  key={item.area}
                  className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3"
                >
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.area}</p>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">{item.rationale}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-[var(--text-secondary)]">
                Strength highlights will appear here once you complete a few responses.
              </p>
            )}
          </div>
        </article>

        <article className="relative overflow-hidden rounded-2xl border border-[var(--accent-primary)]/15 bg-gradient-to-r from-[var(--accent-primary)]/[0.06] via-white to-[var(--accent-secondary)]/[0.04] p-6 shadow-sm">
          <div className="absolute -right-4 -top-4 text-[var(--accent-primary)]/[0.07]">
            <Quote className="h-24 w-24" />
          </div>
          <div className="relative space-y-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.15em] text-[var(--accent-primary)]">
                Today&apos;s Quote
              </p>
              <p className="mt-2 text-sm italic leading-relaxed text-[var(--text-primary)]">
                &ldquo;{quote.text}&rdquo;
              </p>
              <p className="mt-1 text-xs font-semibold text-[var(--accent-primary)]">- {quote.author}</p>
            </div>

            <div className="rounded-xl border border-[var(--border-default)] bg-white/80 p-4">
              <div className="inline-flex items-center gap-2 text-[var(--accent-primary)]">
                <Sparkles className="h-4 w-4" />
                <span className="text-sm font-semibold">Warmup Prompt</span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">{warmupPrompt}</p>
            </div>
          </div>
        </article>
      </div>

      <article className="grid gap-3 rounded-2xl border border-[var(--border-default)] bg-white/80 p-4 shadow-sm md:grid-cols-4">
        <InlineHealthStat
          icon={<CalendarDays className="h-4 w-4" />}
          label="Completed Sessions"
          value={`${overview?.completed_sessions ?? 0}`}
        />
        <InlineHealthStat
          icon={<TrendingUp className="h-4 w-4" />}
          label="Avg Interview Score"
          value={formatPercent(overview?.avg_score ?? null)}
        />
        <InlineHealthStat
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Consistency Risk"
          value={`${contradictionRisk}`}
        />
        <InlineHealthStat
          icon={<Sparkles className="h-4 w-4" />}
          label="Trajectory"
          value={results?.llm_insights.trajectory ?? "N/A"}
        />
      </article>

      <SentenoiLauncher apiKey={VAPI_PUBLIC_KEY} assistantId={VAPI_ASSISTANT_ID} />
    </section>
  );
}

type MetricChipProps = {
  label: string;
  value: number | null | undefined;
  inverse?: boolean;
};

function MetricChip({ label, value, inverse = false }: MetricChipProps) {
  const numeric = typeof value === "number" ? clampPercent(value) : null;
  const displayValue =
    typeof numeric === "number"
      ? `${inverse ? Math.round(100 - numeric) : Math.round(numeric)}%`
      : "N/A";

  return (
    <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-2.5 py-2">
      <p className="text-[10px] uppercase tracking-[0.1em] text-[var(--text-tertiary)]">{label}</p>
      <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{displayValue}</p>
    </div>
  );
}

type ActionLinkProps = {
  href: string;
  title: string;
  subtitle: string;
  icon: ReactNode;
};

function ActionLink({ href, title, subtitle, icon }: ActionLinkProps) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-3 transition hover:border-[var(--accent-primary)]/25"
    >
      <div className="flex items-center justify-between gap-2 text-[var(--text-primary)]">
        <p className="text-sm font-semibold">{title}</p>
        <span className="text-[var(--accent-primary)]">{icon}</span>
      </div>
      <p className="mt-1 text-xs text-[var(--text-secondary)]">{subtitle}</p>
    </Link>
  );
}

type InlineHealthStatProps = {
  icon: ReactNode;
  label: string;
  value: string;
};

function InlineHealthStat({ icon, label, value }: InlineHealthStatProps) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-secondary)] px-3 py-2.5">
      <div className="flex items-center gap-2 text-[var(--text-tertiary)]">
        <span className="text-[var(--accent-primary)]">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-[0.11em]">{label}</p>
      </div>
      <p className="mt-1.5 text-sm font-semibold capitalize text-[var(--text-primary)]">{value}</p>
    </div>
  );
}
