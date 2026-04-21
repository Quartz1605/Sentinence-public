"use client";

import { useState } from "react";
import { PhoneCall, X } from "lucide-react";

import VapiWidget from "@/components/voice/vapi-widget";

type SentenoiLauncherProps = {
  apiKey: string;
  assistantId: string;
};

export default function SentenoiLauncher({ apiKey, assistantId }: SentenoiLauncherProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 inline-flex items-center gap-2 rounded-full border border-[var(--accent-primary)]/40 bg-white/95 px-3 py-2 text-sm font-medium text-[var(--text-primary)] shadow-lg backdrop-blur transition hover:border-[var(--accent-primary)] hover:shadow-xl"
        aria-label="Open sentenoi voice assistant"
      >
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-primary)] text-white shadow">
          <PhoneCall className="h-4 w-4" />
        </span>
        <span className="hidden rounded-full border border-[var(--accent-primary)]/35 px-2.5 py-1 text-xs tracking-wide text-[var(--text-secondary)] md:inline-flex">
          Feeling nervous? Talk with our voice assistant
        </span>
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-3xl border border-[var(--border-default)] bg-[var(--surface-primary)] p-4 shadow-2xl md:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--accent-primary)]">
                  Sentinence Voice Desk
                </p>
                <h2 className="mt-1 text-2xl font-bold text-[var(--text-primary)]">sentenoi</h2>
                <p className="mt-1 text-sm text-[var(--text-secondary)]">
                  Start a call and practice with live transcript before your interview.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border-default)] bg-white text-[var(--text-secondary)] transition hover:text-[var(--text-primary)]"
                aria-label="Close voice assistant"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <VapiWidget
              apiKey={apiKey}
              assistantId={assistantId}
              variant="embedded"
              assistantName="sentenoi"
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
