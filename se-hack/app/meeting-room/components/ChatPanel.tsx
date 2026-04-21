"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { SendHorizonal } from "lucide-react";

import { candidateId } from "../mock-data";
import { ChatMessage, Participant } from "../types";

type ChatPanelProps = {
  messages: ChatMessage[];
  participants: Participant[];
  typingAgentId: string | null;
  onSendMessage: (text: string) => void;
};

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function ChatPanel({ messages, participants, typingAgentId, onSendMessage }: ChatPanelProps) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const typingAgentName = useMemo(() => {
    return participants.find((participant) => participant.id === typingAgentId)?.name ?? null;
  }, [participants, typingAgentId]);

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, typingAgentId]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const cleaned = draft.trim();
    if (!cleaned) return;

    onSendMessage(cleaned);
    setDraft("");
  };

  return (
    <section className="rounded-2xl border border-violet-200/25 bg-black/35 p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-violet-100/80">Team Chat</h2>
        <p className="text-xs text-violet-100/55">Mock real-time feed</p>
      </div>

      <div ref={scrollRef} className="h-72 space-y-2 overflow-y-auto rounded-xl border border-violet-200/15 bg-black/25 p-3">
        {messages.map((message) => {
          const mine = message.senderId === candidateId;
          return (
            <motion.article
              key={message.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.18 }}
              className={`max-w-[90%] rounded-xl px-3 py-2 text-sm ${
                mine
                  ? "ml-auto border border-blue-300/40 bg-blue-300/14 text-blue-50"
                  : "border border-violet-200/25 bg-violet-200/10 text-violet-50"
              }`}
            >
              <div className="mb-1 flex items-center gap-2 text-[11px] text-violet-100/70">
                <span className="font-semibold">{message.senderName}</span>
                <span>{message.senderRole}</span>
                <span>{formatTime(message.timestamp)}</span>
              </div>
              <p>{message.text}</p>
            </motion.article>
          );
        })}

        {typingAgentName ? (
          <motion.div
            initial={{ opacity: 0.3 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, repeat: Number.POSITIVE_INFINITY, repeatType: "reverse" }}
            className="inline-flex items-center gap-2 rounded-lg border border-violet-200/30 bg-violet-200/10 px-3 py-1 text-xs text-violet-100/70"
          >
            <span>{typingAgentName} is typing</span>
            <span className="inline-flex gap-0.5">
              <span className="h-1.5 w-1.5 rounded-full bg-violet-100/80" />
              <span className="h-1.5 w-1.5 rounded-full bg-violet-100/65" />
              <span className="h-1.5 w-1.5 rounded-full bg-violet-100/45" />
            </span>
          </motion.div>
        ) : null}
      </div>

      <form onSubmit={handleSubmit} className="mt-3 flex items-center gap-2">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Share your response with the team..."
          className="h-10 w-full rounded-lg border border-violet-200/25 bg-black/40 px-3 text-sm text-violet-50 outline-none ring-violet-300/60 placeholder:text-violet-100/45 focus:ring"
        />
        <button
          type="submit"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-violet-300 text-black transition hover:bg-violet-200"
          aria-label="Send message"
        >
          <SendHorizonal className="h-4 w-4" />
        </button>
      </form>
    </section>
  );
}
