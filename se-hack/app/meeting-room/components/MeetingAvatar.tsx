"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type MeetingAvatarProps = {
  participantIndex: number;
  isSpeaking: boolean;
};

function nextRandomDelayMs(): number {
  return 260 + Math.floor(Math.random() * 141);
}

function pickNextMouthState(): 0 | 1 | 2 {
  const roll = Math.random();
  if (roll < 0.4) return 1;
  if (roll < 0.8) return 2;
  return 0;
}

export function MeetingAvatar({ participantIndex, isSpeaking }: MeetingAvatarProps) {
  const [mouthState, setMouthState] = useState<0 | 1 | 2>(0);
  const animationTimerRef = useRef<number | null>(null);

  const clearMouthAnimation = () => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  };

  useEffect(() => {
    if (!isSpeaking) {
      clearMouthAnimation();
      setMouthState(0);
      return;
    }

    const tick = () => {
      setMouthState(pickNextMouthState());
      animationTimerRef.current = window.setTimeout(tick, nextRandomDelayMs());
    };

    animationTimerRef.current = window.setTimeout(tick, nextRandomDelayMs());

    return clearMouthAnimation;
  }, [isSpeaking]);

  const idx = participantIndex % 3;
  const imageSrc = `/meeting_faces/face_${idx}_${mouthState}.jpg`;

  return (
    <div className="absolute inset-0 z-0">
      <Image
        src={imageSrc}
        alt={`AI Participant ${idx}`}
        fill
        unoptimized
        className="object-cover transition-transform duration-200"
        style={{
          transform: mouthState === 2 ? "scale(1.03)" : mouthState === 1 ? "scale(1.015)" : "scale(1)",
        }}
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
    </div>
  );
}
