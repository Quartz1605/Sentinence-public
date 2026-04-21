"use client";

import { motion } from "framer-motion";
import { Clock3 } from "lucide-react";

type ScenarioHeaderProps = {
  title: string;
  description: string;
  remainingSec: number;
  prompt: string;
};

const formatTimer = (remainingSec: number): string => {
  const mins = Math.floor(remainingSec / 60)
    .toString()
    .padStart(2, "0");
  const secs = (remainingSec % 60).toString().padStart(2, "0");
  return `${mins}:${secs}`;
};

export function ScenarioHeader({ title, description, remainingSec, prompt }: ScenarioHeaderProps) {
  const isCritical = remainingSec <= 90;

  return (
    <motion.header
      layout
      className="rounded-2xl border border-violet-200/25 bg-violet-200/10 p-4 sm:p-5"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-violet-200/75">Scenario</p>
          <h1 className="mt-1 text-2xl font-semibold text-violet-50 sm:text-3xl">{title}</h1>
          <p className="mt-2 max-w-4xl text-sm text-violet-100/75">{description}</p>
        </div>

        <div
          className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
            isCritical
              ? "border-rose-300/55 bg-rose-300/15 text-rose-100"
              : "border-violet-200/40 bg-black/35 text-violet-100"
          }`}
        >
          <Clock3 className="h-4 w-4" />
          <span className="font-semibold tracking-wide">{formatTimer(remainingSec)}</span>
        </div>
      </div>

      <div className="mt-3 rounded-lg border border-violet-200/30 bg-black/35 px-3 py-2 text-sm text-violet-50 sm:text-base">
        {prompt}
      </div>
    </motion.header>
  );
}
