"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertCircle, ArrowLeft, CheckCircle2, RefreshCcw, Sparkles, TrendingUp } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Loader } from "@/components/ui/Loader";
import { getResultsAnalysis, refreshResultsAnalysis, ResultsAnalysisResponse } from "@/lib/resultsApi";

function compactLabel(input: string, maxLength = 24): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, maxLength - 1)}...`;
}

export default function ResultsPage() {
  const router = useRouter();
  const [result, setResult] = useState<ResultsAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    async function loadResult(forceRefresh = false) {
      if (forceRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError(null);
      try {
        const data = forceRefresh ? await refreshResultsAnalysis() : await getResultsAnalysis();
        if (mounted) {
          setResult(data);
        }
      } catch (err: unknown) {
        if (!mounted) {
          return;
        }
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Failed to load result analytics.");
        }
      } finally {
        if (!mounted) {
          return;
        }
        if (forceRefresh) {
          setRefreshing(false);
        } else {
          setLoading(false);
        }
      }
    }

    loadResult(false);

    return () => {
      mounted = false;
    };
  }, []);

  const scoreTrendData = useMemo(
    () =>
      (result?.score_trend ?? []).map((item, index) => ({
        index: index + 1,
        date: item.date,
        role: compactLabel(item.role, 18),
        score: item.avg_score,
      })),
    [result],
  );

  const weaknessData = useMemo(
    () =>
      (result?.weaknesses ?? []).slice(0, 8).map((item) => ({
        area: compactLabel(item.area, 16),
        frequency: item.frequency,
        impact: item.impact_score,
      })),
    [result],
  );

  const roleData = useMemo(
    () =>
      (result?.role_breakdown ?? []).slice(0, 8).map((item) => ({
        role: compactLabel(item.role, 16),
        sessions: item.sessions,
        score: item.avg_score,
      })),
    [result],
  );

  const communicationData = useMemo(
    () =>
      (result?.communication_trend ?? []).map((item, index) => ({
        index: index + 1,
        confidence: item.confidence,
        clarity: item.clarity,
        nervousness: item.nervousness,
      })),
    [result],
  );

  const radarData = useMemo(
    () =>
      (result?.llm_insights.focus_radar ?? []).map((item) => ({
        metric: compactLabel(item.metric, 18),
        value: item.score,
      })),
    [result],
  );

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader text="Scanning all your past interviews and generating AI analytics..." />
      </div>
    );
  }

  if (error) {
    return (
      <section className="mx-auto max-w-3xl">
        <Card className="border-rose-300 bg-rose-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-rose-700">
              <AlertCircle className="h-5 w-5" /> Could not load results
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-rose-700">
            <p>{error}</p>
            <Button type="button" onClick={() => window.location.reload()}>
              Try again
            </Button>
          </CardContent>
        </Card>
      </section>
    );
  }

  if (!result) {
    return null;
  }

  const { overview, llm_insights: llmInsights } = result;

  return (
    <div className="text-[var(--text-primary)] selection:bg-[var(--accent-primary)]/15">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col justify-between gap-4 rounded-2xl border border-[var(--border-default)] bg-gradient-to-br from-white to-[var(--surface-secondary)] p-6 md:flex-row md:items-center">
          <div>
            <Button
              variant="ghost"
              className="mb-4 pl-0 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              onClick={() => router.push("/dashboard")}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Back to Dashboard
            </Button>
            <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">Interview Analytics Hub</h1>
            <p className="mt-1 text-[var(--text-secondary)]">
              LLM synthesis over your complete interview history, with graph-ready trends and coaching priorities.
            </p>
          </div>
          <div className="text-left md:text-right">
            <Button
              type="button"
              variant="outline"
              onClick={async () => {
                setRefreshing(true);
                setError(null);
                try {
                  const updated = await refreshResultsAnalysis();
                  setResult(updated);
                } catch (err: unknown) {
                  if (err instanceof Error) {
                    setError(err.message);
                  } else {
                    setError("Failed to refresh result analytics.");
                  }
                } finally {
                  setRefreshing(false);
                }
              }}
              disabled={refreshing || loading}
              className="mb-3"
            >
              <RefreshCcw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
              {refreshing ? "Recomputing..." : "Re-run analysis"}
            </Button>
            <div className="bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-secondary)] bg-clip-text text-4xl font-extrabold text-transparent">
              {overview.avg_score.toFixed(1)}
            </div>
            <p className="text-sm font-medium text-[var(--text-tertiary)]">Overall Interview Score</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Total Sessions</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{overview.total_sessions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Completed</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{overview.completed_sessions}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Improvement Delta</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">
                {overview.improvement_delta > 0 ? "+" : ""}
                {overview.improvement_delta.toFixed(1)}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <p className="text-xs uppercase tracking-[0.12em] text-[var(--text-tertiary)]">Contradiction Rate</p>
              <p className="mt-2 text-3xl font-bold text-[var(--text-primary)]">{overview.contradiction_rate.toFixed(1)}%</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <TrendingUp className="h-4 w-4 text-[var(--accent-primary)]" /> Score Trend By Session
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={scoreTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d8" />
                    <XAxis dataKey="index" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">LLM Focus Radar</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart outerRadius={95} data={radarData}>
                    <PolarGrid stroke="#d4d4d8" />
                    <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11 }} />
                    <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                    <Radar dataKey="value" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.35} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Priority Weakness Areas</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weaknessData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="area" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="frequency" fill="#f97316" name="Frequency" radius={[6, 6, 0, 0]} />
                    <Bar dataKey="impact" fill="#ef4444" name="Impact" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Communication Trend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={communicationData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="index" tick={{ fontSize: 12 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Legend />
                    <Line type="monotone" dataKey="confidence" stroke="#22c55e" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="clarity" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
                    <Line type="monotone" dataKey="nervousness" stroke="#f97316" strokeWidth={2.5} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader>
              <CardTitle className="text-base">Role Performance Breakdown</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[260px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={roleData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
                    <XAxis dataKey="role" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                    <Tooltip />
                    <Area type="monotone" dataKey="score" stroke="#14b8a6" fill="#14b8a6" fillOpacity={0.25} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="border-[var(--accent-primary)]/20 bg-[var(--accent-primary)]/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[var(--accent-primary)]">
                <Sparkles className="h-4 w-4" /> AI Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-[var(--text-secondary)]">
              <p>{llmInsights.summary}</p>
              <p>
                <span className="font-semibold text-[var(--text-primary)]">Trajectory:</span> {llmInsights.trajectory}
              </p>
              <p className="text-xs text-[var(--text-tertiary)]">{llmInsights.confidence_note}</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
          <Card className="border-[var(--accent-warning)]/25 bg-[var(--accent-warning)]/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-amber-700">
                <AlertCircle className="h-4 w-4" /> Key Weaknesses
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {llmInsights.key_weaknesses.slice(0, 5).map((item, index) => (
                <article key={`${item.area}-${index}`} className="rounded-xl border border-amber-300/30 bg-white/80 p-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.area}</p>
                  <p className="text-xs text-amber-700">Impact: {item.impact_score.toFixed(1)}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.rationale}</p>
                </article>
              ))}
            </CardContent>
          </Card>

          <Card className="border-[var(--accent-success)]/25 bg-[var(--accent-success)]/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-[var(--accent-success)]">
                <CheckCircle2 className="h-4 w-4" /> Key Strengths
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {llmInsights.key_strengths.slice(0, 5).map((item, index) => (
                <article key={`${item.area}-${index}`} className="rounded-xl border border-emerald-300/35 bg-white/80 p-3">
                  <p className="text-sm font-semibold text-[var(--text-primary)]">{item.area}</p>
                  <p className="mt-1 text-sm text-[var(--text-secondary)]">{item.rationale}</p>
                </article>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coaching Plan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {llmInsights.coaching_plan.map((step, index) => (
              <article key={`${step.phase}-${index}`} className="rounded-xl border border-[var(--border-default)] bg-white p-4">
                <p className="text-xs uppercase tracking-[0.12em] text-[var(--accent-primary)]">{step.phase}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">{step.objective}</p>
                <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[var(--text-secondary)]">
                  {step.action_items.map((action, actionIndex) => (
                    <li key={`${action}-${actionIndex}`}>{action}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-[var(--text-tertiary)]">Success metric: {step.success_metric}</p>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Session Snapshots</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)] text-left text-[var(--text-tertiary)]">
                    <th className="py-2 pr-4">Date</th>
                    <th className="py-2 pr-4">Role</th>
                    <th className="py-2 pr-4">Score</th>
                    <th className="py-2 pr-4">Questions</th>
                    <th className="py-2 pr-4">Contradictions</th>
                    <th className="py-2 pr-4">Top Weakness</th>
                  </tr>
                </thead>
                <tbody>
                  {result.session_snapshots.slice(-10).reverse().map((item) => (
                    <tr key={item.session_id} className="border-b border-[var(--border-subtle)] text-[var(--text-secondary)]">
                      <td className="py-2 pr-4">{item.date || "-"}</td>
                      <td className="py-2 pr-4">{item.role}</td>
                      <td className="py-2 pr-4">{item.avg_score?.toFixed(1) ?? "-"}</td>
                      <td className="py-2 pr-4">{item.question_count}</td>
                      <td className="py-2 pr-4">{item.contradictions}</td>
                      <td className="py-2 pr-4">{item.top_weaknesses[0] ?? "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
