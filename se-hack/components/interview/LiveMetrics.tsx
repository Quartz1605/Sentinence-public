"use client";

import React from "react";
import { VoiceOutput } from "@/hooks/useVoiceWebSocket";
import { Activity, Brain, Volume2 } from "lucide-react";

interface LiveMetricsProps {
  metrics: VoiceOutput | null;
  isRecording: boolean;
}

export function LiveMetrics({ metrics, isRecording }: LiveMetricsProps) {
  if (!isRecording && !metrics?.final_summary) return null;

  // In the unified interview, final_summary is rendered by SessionAnalysis
  if (metrics?.final_summary) return null;

  return (
    <div className="rounded-xl border border-[var(--border-default)] bg-white/90 p-4 flex flex-col gap-3 shadow-sm">
      <div className="flex items-center gap-2 mb-1">
        <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-primary)] animate-pulse" />
        <h3 className="text-xs font-semibold text-[var(--text-primary)] uppercase tracking-wider">
          Voice Diagnostics
        </h3>
      </div>

      {metrics?.acoustic || metrics?.semantic ? (
        <div className="flex flex-col gap-3">
          {metrics.semantic && (
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-1.5">
                  <Activity className="w-3 h-3" /> Confidence
                </span>
                <div className="h-1.5 w-full bg-[var(--surface-tertiary)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-[var(--accent-success)] to-[var(--accent-primary)] transition-all duration-300 rounded-full"
                    style={{
                      width: `${Math.min(100, Math.max(0, metrics.semantic.confidence_score * 100))}%`,
                    }}
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1">
                  <Brain className="w-3 h-3" /> Stress
                </span>
                <span
                  className={`text-sm font-semibold capitalize ${
                    metrics.semantic.stress_level === "high"
                      ? "text-[var(--accent-danger)]"
                      : metrics.semantic.stress_level === "medium"
                        ? "text-amber-600"
                        : "text-[var(--accent-success)]"
                  }`}
                >
                  {metrics.semantic.stress_level}
                </span>
              </div>
            </div>
          )}

          {metrics.acoustic && (
            <div className="grid grid-cols-2 gap-3 pt-2 border-t border-[var(--border-subtle)]">
              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--text-tertiary)] flex items-center gap-1 mb-0.5">
                  <Volume2 className="w-3 h-3" /> Pitch
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {metrics.acoustic.pitch.toFixed(1)} Hz
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[11px] text-[var(--text-tertiary)]">Speaking Rate</span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {metrics.acoustic.speaking_rate.toFixed(1)}
                </span>
              </div>
            </div>
          )}

          {metrics.semantic?.insight && (
            <div className="rounded-lg border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/4 p-2.5 text-xs text-[var(--accent-primary)]">
              <span className="font-semibold mr-1.5">Behavior Insight:</span>
              {metrics.semantic.insight}
            </div>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center py-4 text-[var(--text-tertiary)] text-sm">
          Analyzing metrics in background...
        </div>
      )}
    </div>
  );
}
