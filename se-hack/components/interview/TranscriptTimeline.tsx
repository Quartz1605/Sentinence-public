"use client";

import React, { useEffect, useRef } from "react";
import { TranscriptWord, VoiceOutput } from "@/hooks/useVoiceWebSocket";
import { Clock, MessageSquareText } from "lucide-react";

interface TranscriptTimelineProps {
  transcript: TranscriptWord[];
  insights: VoiceOutput["semantic"][];
  isRecording: boolean;
}

export function TranscriptTimeline({ transcript, insights, isRecording }: TranscriptTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new words arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [transcript.length]);

  // Group transcript words into time-bucketed lines (every 5 seconds)
  const groupedLines: { startTime: string; text: string; startSec: number }[] = [];
  let currentBucket = -1;
  for (const word of transcript) {
    const bucket = Math.floor(word.start / 5);
    if (bucket !== currentBucket) {
      groupedLines.push({
        startTime: word.timestamp,
        text: word.word,
        startSec: word.start,
      });
      currentBucket = bucket;
    } else {
      groupedLines[groupedLines.length - 1].text += " " + word.word;
    }
  }

  // Find insights that match a time range
  function getInsightForTime(startSec: number): VoiceOutput["semantic"] | undefined {
    return insights.find((ins) => {
      if (!ins?.time_range || ins.time_range.length < 2) return false;
      return startSec >= ins.time_range[0] && startSec <= ins.time_range[1];
    });
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border-default)]">
        <MessageSquareText className="w-4 h-4 text-[var(--accent-primary)]" />
        <h3 className="text-sm font-semibold text-[var(--text-primary)]">Live Transcript</h3>
        {isRecording && (
          <div className="ml-auto flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-danger)] animate-pulse" />
            <span className="text-[11px] font-medium text-[var(--accent-danger)]">RECORDING</span>
          </div>
        )}
      </div>

      {/* Scrollable transcript body */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-3 space-y-2 min-h-0">
        {groupedLines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-[var(--text-tertiary)] text-sm">
            <Clock className="w-8 h-8 mb-2 opacity-30" />
            <p>Transcript will appear here...</p>
          </div>
        ) : (
          groupedLines.map((line, idx) => {
            const insight = getInsightForTime(line.startSec);
            return (
              <div key={idx} className="group">
                <div className="flex gap-2.5">
                  <span className="shrink-0 text-[11px] font-mono font-medium text-[var(--accent-primary)] mt-0.5 w-10">
                    {line.startTime}
                  </span>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed">{line.text}</p>
                </div>
                {insight && (
                  <div className="ml-12 mt-1 mb-1 rounded-lg border border-[var(--accent-primary)]/15 bg-[var(--accent-primary)]/4 px-3 py-2 text-xs text-[var(--accent-primary)]">
                    <span className="font-semibold mr-1">Insight:</span>
                    {insight.insight}
                    {insight.stress_level && (
                      <span
                        className={`ml-2 inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          insight.stress_level === "high"
                            ? "bg-[var(--accent-danger)]/10 text-[var(--accent-danger)]"
                            : insight.stress_level === "medium"
                              ? "bg-amber-500/10 text-amber-600"
                              : "bg-[var(--accent-success)]/10 text-[var(--accent-success)]"
                        }`}
                      >
                        {insight.stress_level} stress
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
