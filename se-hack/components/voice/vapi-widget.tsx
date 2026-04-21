"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Vapi from "@vapi-ai/web";
import { PhoneCall, PhoneOff } from "lucide-react";

interface VapiWidgetProps {
  apiKey: string;
  assistantId: string;
  config?: Record<string, unknown>;
  variant?: "floating" | "embedded";
  assistantName?: string;
}

type TranscriptEntry = {
  role: string;
  text: string;
};

type VapiClient = InstanceType<typeof Vapi>;

type VapiTranscriptMessage = {
  type?: string;
  role?: string;
  transcript?: string;
};

const STATUS_COPY = {
  idle: "Talk to Assistant",
  dialing: "Connecting...",
  listening: "Listening...",
  speaking: "Assistant Speaking",
};

const MAX_TRANSCRIPTS = 60;

const getReadableRole = (role: string) => {
  if (role === "user") return "You";
  if (role === "assistant") return "Assistant";
  return role || "Assistant";
};

const formatError = (error: unknown) => {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return "Unable to start the voice session.";
};

const createVapiClient = (apiKey: string) => {
  if (!apiKey) {
    throw new Error("Missing Vapi public API key.");
  }
  return new Vapi(apiKey);
};

const VapiWidget = ({
  apiKey,
  assistantId,
  config,
  variant = "floating",
  assistantName = "sentenoi",
}: VapiWidgetProps) => {
  const clientRef = useRef<VapiClient | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isDialing, setIsDialing] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const vapiInstance = createVapiClient(apiKey);
      clientRef.current = vapiInstance;

      const handleCallStart = () => {
        setIsConnected(true);
        setIsDialing(false);
        setError(null);
      };

      const handleCallEnd = () => {
        setIsConnected(false);
        setIsSpeaking(false);
        setIsDialing(false);
      };

      const handleSpeechStart = () => setIsSpeaking(true);
      const handleSpeechEnd = () => setIsSpeaking(false);

      const handleMessage = (message: VapiTranscriptMessage) => {
        if (message?.type !== "transcript" || !message.transcript) return;

        setTranscript((prev) => {
          const next = [...prev, { role: getReadableRole(message.role ?? "assistant"), text: message.transcript ?? "" }];
          return next.slice(-MAX_TRANSCRIPTS);
        });
      };

      const handleError = (err: unknown) => {
        console.error("Vapi error", err);
        setError(formatError(err));
        setIsDialing(false);
      };

      vapiInstance.on("call-start", handleCallStart);
      vapiInstance.on("call-end", handleCallEnd);
      vapiInstance.on("speech-start", handleSpeechStart);
      vapiInstance.on("speech-end", handleSpeechEnd);
      vapiInstance.on("message", handleMessage);
      vapiInstance.on("error", handleError);

      return () => {
        vapiInstance.stop();
        // @ts-expect-error upstream types may not expose removeAllListeners yet
        vapiInstance.removeAllListeners?.();
        if (clientRef.current === vapiInstance) {
          clientRef.current = null;
        }
      };
    } catch (err) {
      const nextError = formatError(err);
      queueMicrotask(() => {
        setError(nextError);
      });
    }
  }, [apiKey]);

  const startCall = useCallback(() => {
    const client = clientRef.current;
    if (!client) {
      setError("Voice client is still initializing. Please try again in a second.");
      return;
    }

    if (!assistantId) {
      setError("Missing assistant id.");
      return;
    }

    try {
      setIsDialing(true);
      setTranscript([]);

      if (config && Object.keys(config).length > 0) {
        // @ts-expect-error config typing not yet available in SDK definitions
        client.start(assistantId, config);
      } else {
        client.start(assistantId);
      }
    } catch (err) {
      setError(formatError(err));
      setIsDialing(false);
    }
  }, [assistantId, config]);

  const endCall = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    client.stop();
    setIsDialing(false);
    setIsConnected(false);
    setIsSpeaking(false);
  }, []);

  const statusLabel = useMemo(() => {
    if (isSpeaking) return STATUS_COPY.speaking;
    if (isConnected) return STATUS_COPY.listening;
    if (isDialing) return STATUS_COPY.dialing;
    return STATUS_COPY.idle;
  }, [isConnected, isDialing, isSpeaking]);

  const showTranscriptPanel = isConnected || transcript.length > 0;

  const renderTranscript = () => (
    <div className="mt-4 max-h-60 space-y-3 overflow-y-auto rounded-2xl bg-[var(--surface-secondary)] p-3 text-sm">
      {transcript.length === 0 ? (
        <p className="text-[var(--text-tertiary)]">Conversation will appear here.</p>
      ) : (
        transcript.map((entry, index) => (
          <div key={`${entry.role}-${index}`} className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">{entry.role}</p>
            <p className="rounded-2xl bg-white px-3 py-2 text-[var(--text-primary)] shadow" aria-live="polite">
              {entry.text}
            </p>
          </div>
        ))
      )}
    </div>
  );

  if (variant === "embedded") {
    return (
      <div className="w-full rounded-3xl border border-[var(--accent-primary)]/25 bg-white/90 p-6 shadow-xl">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-[var(--text-tertiary)]">Sentinence Voice Agent</p>
            <h3 className="text-2xl font-semibold text-[var(--text-primary)]">{assistantName}</h3>
            <p className="text-sm text-[var(--text-secondary)]">{statusLabel}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={startCall}
              disabled={isDialing || isConnected}
              className={`inline-flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-[var(--accent-primary)]/40 bg-gradient-to-br from-[var(--accent-primary)] to-emerald-500 text-white shadow-lg transition-all hover:from-[var(--accent-primary)]/90 hover:to-emerald-500/90 ${
                isDialing || isConnected ? "opacity-60" : ""
              }`}
            >
              <PhoneCall className="h-7 w-7" />
              <span className="sr-only">Start call</span>
            </button>
            <button
              type="button"
              onClick={endCall}
              disabled={!isConnected && !isDialing}
              className={`inline-flex items-center gap-2 rounded-2xl border border-rose-500/40 px-5 py-2 text-sm font-semibold text-rose-600 shadow-lg transition-colors ${
                !isConnected && !isDialing ? "opacity-60" : "hover:bg-rose-50"
              }`}
            >
              <PhoneOff className="h-4 w-4" />
              Cut Call
            </button>
            {isDialing && <span className="text-sm text-[var(--text-tertiary)]">Awaiting approval...</span>}
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </div>
        )}

        <div className="mt-6 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)]/40 p-4">
          {renderTranscript()}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex w-full max-w-xs flex-col gap-3 text-sm md:max-w-sm">
      {error && (
        <div className="rounded-2xl border border-rose-300 bg-rose-50 px-4 py-3 text-rose-700 shadow-xl backdrop-blur">
          {error}
        </div>
      )}

      {!showTranscriptPanel ? (
        <button
          type="button"
          onClick={startCall}
          disabled={isDialing}
          className="group flex h-16 w-16 items-center justify-center rounded-full border border-emerald-400/40 bg-gradient-to-r from-emerald-500 to-emerald-400 text-white shadow-2xl shadow-emerald-500/30 transition-transform duration-200 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-70"
        >
          <PhoneCall className="h-6 w-6" />
          <span className="sr-only" aria-live="polite">
            {statusLabel}
          </span>
        </button>
      ) : (
        <div className="rounded-3xl border border-[var(--border-default)] bg-white/95 p-5 shadow-2xl backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-[var(--text-tertiary)]">Sentinence Voice Agent</p>
              <p className="text-base font-semibold text-[var(--text-primary)]" aria-live="polite">
                {statusLabel}
              </p>
            </div>
            <button
              type="button"
              onClick={endCall}
              disabled={!isConnected && !isDialing}
              className="inline-flex items-center gap-2 rounded-full bg-rose-500/90 px-3 py-1 text-xs font-semibold text-white shadow hover:bg-rose-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <PhoneOff className="h-3 w-3" />
              Cut Call
            </button>
          </div>

          {renderTranscript()}

          {!isConnected && (
            <button
              type="button"
              onClick={startCall}
              disabled={isDialing}
              className="mt-4 flex w-full items-center justify-center rounded-2xl border border-emerald-400/40 bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-3 text-sm font-semibold text-white shadow-lg disabled:cursor-not-allowed disabled:opacity-70"
            >
              <PhoneCall className="mr-2 h-4 w-4" />
              <span aria-live="polite">{statusLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default VapiWidget;
