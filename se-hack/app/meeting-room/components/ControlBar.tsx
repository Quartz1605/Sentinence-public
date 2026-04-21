"use client";

import { motion } from "framer-motion";
import { Camera, CameraOff, Hand, Mic, MicOff, PhoneOff } from "lucide-react";

type ControlBarProps = {
  micEnabled: boolean;
  cameraEnabled: boolean;
  handRaised: boolean;
  onToggleMic: () => void;
  onToggleCamera: () => void;
  onToggleHand: () => void;
  onEndSession: () => void;
};

export function ControlBar({
  micEnabled,
  cameraEnabled,
  handRaised,
  onToggleMic,
  onToggleCamera,
  onToggleHand,
  onEndSession,
}: ControlBarProps) {
  return (
    <footer className="sticky bottom-16 z-30 flex justify-center lg:bottom-4">
      <div className="flex items-center gap-2 rounded-full border border-violet-200/30 bg-black/80 px-3 py-2 shadow-2xl backdrop-blur-xl">
        <ActionButton active={micEnabled} onClick={onToggleMic} label={micEnabled ? "Mute mic" : "Unmute mic"}>
          {micEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
        </ActionButton>

        <ActionButton
          active={cameraEnabled}
          onClick={onToggleCamera}
          label={cameraEnabled ? "Turn camera off" : "Turn camera on"}
        >
          {cameraEnabled ? <Camera className="h-4 w-4" /> : <CameraOff className="h-4 w-4" />}
        </ActionButton>

        <ActionButton active={handRaised} onClick={onToggleHand} label="Raise hand">
          <Hand className="h-4 w-4" />
        </ActionButton>

        <motion.button
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.95 }}
          type="button"
          onClick={onEndSession}
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-rose-500 text-rose-50 transition hover:bg-rose-400"
          aria-label="End session"
          title="End session"
        >
          <PhoneOff className="h-4 w-4" />
        </motion.button>
      </div>
    </footer>
  );
}

type ActionButtonProps = {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
};

function ActionButton({ active, onClick, label, children }: ActionButtonProps) {
  return (
    <motion.button
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.95 }}
      type="button"
      onClick={onClick}
      className={`inline-flex h-10 w-10 items-center justify-center rounded-full border transition ${
        active
          ? "border-emerald-300/55 bg-emerald-300/18 text-emerald-100"
          : "border-violet-200/30 bg-violet-200/10 text-violet-100"
      }`}
      aria-label={label}
      title={label}
    >
      {children}
    </motion.button>
  );
}
