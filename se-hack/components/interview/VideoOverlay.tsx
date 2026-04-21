"use client";

import React from "react";
import { VideoAnalysis } from "@/hooks/useVideoAnalysis";

interface VideoOverlayProps {
  analysis: VideoAnalysis | null;
  isCapturing: boolean;
  fps: number;
}

export function VideoOverlay({ analysis, isCapturing, fps }: VideoOverlayProps) {
  return (
    <>
      {/* Top-left status badge */}
      <div className="absolute top-3 left-3 flex gap-2 z-10">
        <div className="px-2.5 py-1 rounded-full bg-white/80 backdrop-blur-md text-[11px] font-mono font-semibold border border-[var(--border-default)] flex items-center gap-1.5 shadow-sm">
          <div
            className={`w-1.5 h-1.5 rounded-full ${isCapturing ? "bg-[var(--accent-success)] animate-pulse" : "bg-[var(--text-tertiary)]"}`}
          />
          {isCapturing ? "LIVE" : "IDLE"}
        </div>
        {isCapturing && fps > 0 && (
          <div className="px-2 py-1 rounded-full bg-white/80 backdrop-blur-md text-[10px] font-mono text-[var(--text-tertiary)] border border-[var(--border-default)] shadow-sm">
            {fps} FPS
          </div>
        )}
      </div>

      {/* Bottom overlay bar */}
      {analysis && isCapturing && (
        <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-2 z-10">
          {/* Emotion badge */}
          <div className="px-3 py-1.5 rounded-xl bg-white/85 backdrop-blur-md border border-[var(--border-default)] shadow-sm">
            <span className="text-[11px] text-[var(--text-tertiary)]">Emotion: </span>
            <span className="text-sm font-semibold text-[var(--text-primary)] capitalize">
              {analysis.dominant_emotion}
            </span>
          </div>

          {/* Scores */}
          <div className="flex gap-2">
            <ScorePill label="Engage" value={analysis.engagement_score} color="var(--accent-success)" />
            <ScorePill label="Confid" value={analysis.confidence_score} color="var(--accent-primary)" />
          </div>
        </div>
      )}

      {/* No face warning */}
      {analysis && isCapturing && !analysis.face_detected && (
        <div className="absolute top-3 right-3 text-[11px] text-[var(--accent-danger)] bg-[var(--accent-danger)]/8 px-2.5 py-1 rounded-lg border border-[var(--accent-danger)]/20 font-medium z-10">
          No face detected
        </div>
      )}
    </>
  );
}

function ScorePill({ label, value, color }: { label: string; value: number; color: string }) {
  const percent = Math.round(value * 100);
  return (
    <div className="flex flex-col items-center px-2.5 py-1.5 rounded-xl bg-white/85 backdrop-blur-md border border-[var(--border-default)] shadow-sm min-w-[52px]">
      <span className="text-[9px] font-medium text-[var(--text-tertiary)] uppercase tracking-wider">
        {label}
      </span>
      <span className="text-sm font-bold" style={{ color }}>
        {percent}%
      </span>
    </div>
  );
}
