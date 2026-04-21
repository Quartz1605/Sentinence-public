"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Mic, MicOff, UserCircle2 } from "lucide-react";

import { Participant } from "../types";

type ParticipantCardProps = {
  participant: Participant;
  isActiveSpeaker: boolean;
  cameraEnabledForCandidate: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  dominantEmotion?: string | null;
};

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((chunk) => chunk[0]?.toUpperCase() ?? "")
    .join("");
}

function statusClass(status: Participant["status"]): string {
  if (status === "speaking") return "text-emerald-200 bg-emerald-300/15 border-emerald-300/30";
  if (status === "needs_help") return "text-amber-100 bg-amber-300/15 border-amber-300/35";
  return "text-violet-100 bg-violet-200/12 border-violet-200/30";
}

function statusLabel(status: Participant["status"]): string {
  if (status === "speaking") return "Speaking";
  if (status === "needs_help") return "Needs Help";
  return "Idle";
}

export function ParticipantCard({
  participant,
  isActiveSpeaker,
  cameraEnabledForCandidate,
  videoRef,
  dominantEmotion,
}: ParticipantCardProps) {
  const isCandidate = !participant.isAi;
  const showVideo = participant.isAi || cameraEnabledForCandidate;

  return (
    <motion.article
      layout
      initial={{ opacity: 0.88, scale: 0.985 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.2 }}
      className={`relative min-h-52 overflow-hidden rounded-2xl border p-3 sm:min-h-64 ${
        isActiveSpeaker
          ? "border-emerald-300/70 bg-[linear-gradient(155deg,rgba(52,211,153,0.16),rgba(17,24,39,0.86))] shadow-[0_0_0_1px_rgba(110,231,183,0.35)]"
          : "border-violet-200/22 bg-[linear-gradient(155deg,rgba(125,90,190,0.18),rgba(13,11,19,0.86))]"
      }`}
    >
      <div className="absolute -left-8 -top-8 h-28 w-28 rounded-full bg-violet-300/20 blur-2xl" />
      <div className="absolute bottom-0 right-0 h-24 w-24 rounded-full bg-indigo-300/10 blur-2xl" />

      <div className="relative flex h-full flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-sm font-semibold text-violet-50">{participant.name}</p>
            <p className="text-xs text-violet-100/70">{participant.role}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`rounded-full border px-2 py-0.5 text-[11px] ${statusClass(participant.status)}`}>
              {statusLabel(participant.status)}
            </span>
            {participant.isMuted ? (
              <MicOff className="h-4 w-4 text-rose-200" />
            ) : (
              <Mic className="h-4 w-4 text-violet-100/90" />
            )}
          </div>
        </div>

        <div className="my-3 flex flex-1 items-center justify-center">
          {isCandidate && cameraEnabledForCandidate && videoRef ? (
            <div className="relative w-full h-full min-h-[100px] overflow-hidden rounded-xl">
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1] rounded-xl"
              />
              <div className="absolute top-2 left-2 flex items-center gap-1.5 rounded-full bg-black/60 px-2 py-0.5 backdrop-blur-sm">
                <div className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-mono text-emerald-200">LIVE</span>
              </div>
              {dominantEmotion && (
                <div className="absolute bottom-2 left-2 rounded-lg bg-black/60 px-2 py-1 backdrop-blur-sm">
                  <span className="text-[10px] text-violet-100/80">Emotion: </span>
                  <span className="text-[10px] font-semibold text-white capitalize">{dominantEmotion}</span>
                </div>
              )}
            </div>
          ) : showVideo ? (
            <div className="relative flex h-20 w-20 items-center justify-center rounded-full border border-violet-100/20 bg-black/35 text-violet-100/90">
              <span className="text-2xl font-semibold">{initials(participant.name)}</span>
              <div className="absolute -bottom-2 rounded-full bg-black/55 px-2 py-0.5 text-[10px] text-violet-100/75">
                {participant.isAi ? "AI Agent" : "Mock stream live"}
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-xl border border-violet-200/20 bg-black/35 px-4 py-3 text-violet-100/80">
              <UserCircle2 className="h-8 w-8" />
              <p className="text-xs">Camera is off</p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2">
          <p className="text-xs text-violet-100/70">{participant.personality}</p>

          {participant.status === "speaking" ? <Waveform /> : null}
          {participant.status === "needs_help" ? (
            <span className="inline-flex items-center gap-1 rounded-md bg-amber-300/18 px-2 py-1 text-[10px] text-amber-100">
              <AlertTriangle className="h-3 w-3" />
              Help needed
            </span>
          ) : null}
        </div>
      </div>
    </motion.article>
  );
}

function Waveform() {
  const bars = [0, 1, 2, 3, 4];

  return (
    <div className="inline-flex items-end gap-1 rounded-md border border-emerald-300/40 bg-emerald-300/14 px-2 py-1">
      {bars.map((bar) => (
        <motion.span
          key={bar}
          className="w-1 rounded bg-emerald-200"
          animate={{
            height: [6, 12 + (bar % 2) * 6, 7 + ((bar + 1) % 3) * 4, 6],
            opacity: [0.55, 1, 0.8, 0.55],
          }}
          transition={{
            duration: 0.95,
            repeat: Number.POSITIVE_INFINITY,
            ease: "easeInOut",
            delay: bar * 0.07,
          }}
        />
      ))}
    </div>
  );
}
