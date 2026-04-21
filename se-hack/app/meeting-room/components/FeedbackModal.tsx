"use client";

import { AnimatePresence, motion } from "framer-motion";

import { FeedbackReport } from "../types";

type FeedbackModalProps = {
  open: boolean;
  report: FeedbackReport | null;
  onClose: () => void;
  onRestart: () => void;
};

export function FeedbackModal({ open, report, onClose, onRestart }: FeedbackModalProps) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/75 p-4"
        >
          <motion.div
            initial={{ opacity: 0, y: 18, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.98 }}
            className="w-full max-w-2xl rounded-2xl border border-violet-200/30 bg-[#150f1f] p-5 shadow-2xl"
          >
            <p className="text-xs uppercase tracking-[0.18em] text-violet-200/75">Session Feedback</p>
            <h3 className="mt-2 text-2xl font-semibold text-violet-50">AI Team Simulation Review</h3>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ScoreCard label="Overall" value={report?.overallScore ?? 0} />
              <ScoreCard label="Strengths" value={report?.strengths.length ?? 0} isCount />
              <ScoreCard label="Weaknesses" value={report?.weaknesses.length ?? 0} isCount />
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-emerald-300/30 bg-emerald-300/10 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-emerald-100/75">Strengths</p>
                <ul className="mt-2 space-y-1 text-sm text-emerald-50/95">
                  {(report?.strengths ?? []).map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>

              <div className="rounded-xl border border-amber-300/35 bg-amber-300/10 p-3">
                <p className="text-xs uppercase tracking-[0.12em] text-amber-100/80">Weaknesses</p>
                <ul className="mt-2 space-y-1 text-sm text-amber-50/95">
                  {(report?.weaknesses ?? []).map((item) => (
                    <li key={item}>- {item}</li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-violet-200/25 bg-black/35 p-3 text-sm text-violet-100/85">
              {report?.summary ?? "No summary available."}
            </div>

            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-violet-200/35 bg-black/40 px-4 py-2 text-sm text-violet-100 transition hover:border-violet-200/65"
              >
                Close
              </button>
              <button
                type="button"
                onClick={onRestart}
                className="rounded-lg bg-violet-300 px-4 py-2 text-sm font-semibold text-black transition hover:bg-violet-200"
              >
                Restart Simulation
              </button>
            </div>
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

type ScoreCardProps = {
  label: string;
  value: number;
  isCount?: boolean;
};

function ScoreCard({ label, value, isCount = false }: ScoreCardProps) {
  return (
    <div className="rounded-xl border border-violet-200/25 bg-black/35 p-3">
      <p className="text-xs uppercase tracking-[0.12em] text-violet-100/65">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-violet-50">
        {value}
        {isCount ? "" : "%"}
      </p>
    </div>
  );
}
