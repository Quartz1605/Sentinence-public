"use client";

import React from "react";
import { VoiceOutput } from "@/hooks/useVoiceWebSocket";
import { FileText, Clock } from "lucide-react";

interface SessionAnalysisProps {
  finalSummary: VoiceOutput["final_summary"];
}

export function SessionAnalysis({ finalSummary }: SessionAnalysisProps) {
  if (!finalSummary) return null;

  return (
    <div className="rounded-2xl border border-[var(--border-default)] bg-white/90 shadow-md overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-500">
      {/* Header */}
      <div className="px-6 py-4 border-b border-[var(--border-default)] bg-gradient-to-r from-[var(--accent-primary)]/5 to-transparent">
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-[var(--accent-primary)]" />
          <h3 className="text-lg font-bold text-[var(--text-primary)]">Final Session Analysis</h3>
        </div>
      </div>

      {/* Summary */}
      <div className="px-6 py-5">
        <p className="text-sm text-[var(--text-secondary)] leading-relaxed">
          {finalSummary.overall_summary}
        </p>
      </div>

      {/* Key Moments */}
      {finalSummary.key_moments && finalSummary.key_moments.length > 0 && (
        <div className="px-6 pb-6">
          <div className="border-t border-[var(--border-default)] pt-4">
            <h4 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)] mb-3 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" />
              Key Moments
            </h4>
            <ul className="space-y-3">
              {finalSummary.key_moments.map((km, idx) => (
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
  );
}
