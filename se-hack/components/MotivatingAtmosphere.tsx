"use client";

import { useEffect, useState, useRef } from "react";

const QUOTES = [
  "Take a deep breath. You are prepared for this.",
  "Every expert was once a beginner.",
  "Your potential is endless.",
  "Confidence comes from within. Trust your journey.",
  "Speak your truth. The right team will listen.",
  "Challenges are just opportunities in disguise."
];

type MotivatingAtmosphereProps = {
  floating?: boolean;
  className?: string;
};

export function MotivatingAtmosphere({ floating = true, className = "" }: MotivatingAtmosphereProps) {
  const [quoteIndex, setQuoteIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const containerClassName = floating
    ? "absolute top-8 right-8 z-50 flex flex-col items-end gap-4"
    : "flex w-full flex-col items-end gap-4";

  useEffect(() => {
    const interval = setInterval(() => {
      setQuoteIndex((prev) => (prev + 1) % QUOTES.length);
    }, 6000); // Rotate every 6 seconds

    return () => clearInterval(interval);
  }, []);

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("Audio play failed:", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  return (
    <div className={`${containerClassName} ${className}`.trim()}>
      {/* Audio Element (Calming Sound) */}
      <audio
        ref={audioRef}
        loop
        src="https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3"
        preload="auto"
      />

      <button
        onClick={toggleAudio}
        className="flex items-center gap-2 px-4 py-2 rounded-full bg-white/50 backdrop-blur-md border border-[var(--border-default)] shadow-sm hover:bg-white/80 transition-all text-sm font-medium text-[var(--text-secondary)]"
      >
        {isPlaying ? (
          <>
            <span className="flex h-2 w-2 rounded-full bg-[var(--accent-success)] animate-pulse" />
            Playing Calming Sounds
          </>
        ) : (
          <>
            <span className="flex h-2 w-2 rounded-full bg-[var(--text-tertiary)]" />
            Play Calming Sounds
          </>
        )}
      </button>

      {/* Rotating Motivating Quote */}
      <div className="w-full max-w-[18rem] p-5 rounded-2xl bg-white/40 backdrop-blur-xl border border-white/60 shadow-[0_8px_30px_rgb(0,0,0,0.04)] text-right relative overflow-hidden transition-all duration-700">
        <div className="absolute inset-0 bg-gradient-to-br from-white/40 to-transparent pointer-events-none" />
        <p
          key={quoteIndex}
          className="font-serif text-xl italic text-[var(--text-primary)] leading-relaxed animate-in fade-in slide-in-from-bottom-2 duration-1000 relative z-10"
        >
          "{QUOTES[quoteIndex]}"
        </p>
      </div>
    </div>
  );
}
