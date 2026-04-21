"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { AnalyticsSnapshot, Participant } from "../types";

type InsightsPanelProps = {
  interruptionsCount: number;
  helpfulnessScore: number;
  confidenceScore: number;
  engagementScore: number;
  participants: Participant[];
  speakingShare: Record<string, number>;
  history: AnalyticsSnapshot[];
};

const barPalette = ["bg-blue-300", "bg-violet-300", "bg-emerald-300", "bg-amber-300", "bg-rose-300"];

export function InsightsPanel({
  interruptionsCount,
  helpfulnessScore,
  confidenceScore,
  engagementScore,
  participants,
  speakingShare,
  history,
}: InsightsPanelProps) {
  const topSpeaker = participants
    .map((participant) => ({
      name: participant.name,
      value: speakingShare[participant.id] ?? 0,
    }))
    .sort((a, b) => b.value - a.value)[0];

  return (
    <section className="rounded-2xl border border-violet-200/25 bg-black/35 p-4">
      <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-100/80">Live Insights</h2>

      <div className="mt-3 space-y-2 rounded-xl border border-violet-200/15 bg-black/25 p-3">
        <p className="text-xs uppercase tracking-[0.12em] text-violet-100/60">Speaking Time (%)</p>
        {participants.map((participant, index) => {
          const value = speakingShare[participant.id] ?? 0;
          return (
            <div key={participant.id}>
              <div className="mb-1 flex items-center justify-between text-xs text-violet-100/75">
                <span>{participant.name}</span>
                <span>{value}%</span>
              </div>
              <div className="h-2.5 rounded-full bg-violet-100/10">
                <div
                  className={`h-2.5 rounded-full ${barPalette[index % barPalette.length]} transition-all duration-300`}
                  style={{ width: `${Math.max(5, value)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <StatCard label="Interruptions" value={interruptionsCount.toString()} tone="text-rose-100" />
        <StatCard
          label="Dominance Meter"
          value={`${topSpeaker?.name ?? "N/A"} (${topSpeaker?.value ?? 0}%)`}
          tone="text-violet-100"
        />
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <CircularScore label="Helpfulness" value={helpfulnessScore} />
        <CircularScore label="Confidence" value={confidenceScore} />
        <CircularScore label="Engagement" value={engagementScore} />
      </div>

      <div className="mt-3 rounded-xl border border-violet-200/15 bg-black/25 p-3">
        <p className="mb-2 text-xs uppercase tracking-[0.12em] text-violet-100/60">Trend</p>
        <div className="h-44">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={history} margin={{ left: 0, right: 8, top: 4, bottom: 0 }}>
              <CartesianGrid stroke="rgba(196, 181, 253, 0.15)" strokeDasharray="3 3" />
              <XAxis
                dataKey="elapsedSec"
                tick={{ fontSize: 11, fill: "rgba(237, 233, 254, 0.75)" }}
                tickFormatter={(value) => `${Math.floor(value / 60)}m`}
              />
              <YAxis tick={{ fontSize: 11, fill: "rgba(237, 233, 254, 0.75)" }} domain={[0, 100]} />
              <Tooltip
                contentStyle={{
                  background: "rgba(10, 8, 16, 0.95)",
                  border: "1px solid rgba(196, 181, 253, 0.2)",
                  borderRadius: "0.75rem",
                }}
              />
              <Line type="monotone" dataKey="confidence" stroke="#bfdbfe" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="helpfulness" stroke="#c4b5fd" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="engagement" stroke="#86efac" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}

type StatCardProps = {
  label: string;
  value: string;
  tone: string;
};

function StatCard({ label, value, tone }: StatCardProps) {
  return (
    <div className="rounded-xl border border-violet-200/20 bg-black/30 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-100/60">{label}</p>
      <p className={`mt-1 text-sm font-medium ${tone}`}>{value}</p>
    </div>
  );
}

type CircularScoreProps = {
  label: string;
  value: number;
};

function CircularScore({ label, value }: CircularScoreProps) {
  const bounded = Math.min(100, Math.max(0, value));

  return (
    <div className="rounded-xl border border-violet-200/20 bg-black/30 p-2 text-center">
      <div
        className="mx-auto flex h-16 w-16 items-center justify-center rounded-full"
        style={{
          background: `conic-gradient(rgba(196,181,253,0.95) ${bounded * 3.6}deg, rgba(255,255,255,0.12) ${bounded * 3.6}deg)`,
        }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#100b19] text-xs font-semibold text-violet-100">
          {bounded}
        </div>
      </div>
      <p className="mt-1 text-[11px] text-violet-100/70">{label}</p>
    </div>
  );
}
