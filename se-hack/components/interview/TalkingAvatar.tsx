"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import styles from "./TalkingAvatar.module.css";

type MouthState = "closed" | "open" | "wide";

type TalkingAvatarProps = {
  audioSrc: string;
  isPlaying?: boolean;
  faceImages?: Record<MouthState, string>;
  isFluid?: boolean;
};

const FACE_IMAGE_BY_STATE: Record<MouthState, string> = {
  closed: "/face-1.png",
  open: "/face-2.png",
  wide: "/face-3.png",
};

function nextRandomDelayMs(): number {
  return 260 + Math.floor(Math.random() * 141);
}

function pickNextMouthState(): MouthState {
  const roll = Math.random();
  if (roll < 0.4) {
    return "open";
  }
  if (roll < 0.8) {
    return "wide";
  }
  return "closed";
}

export default function TalkingAvatar({ audioSrc, isPlaying, faceImages, isFluid }: TalkingAvatarProps) {
  const [mouthState, setMouthState] = useState<MouthState>("closed");
  const [audioPlaying, setAudioPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const animationTimerRef = useRef<number | null>(null);

  const shouldPlay = isPlaying ?? true;
  const activeFaceSet = faceImages ?? FACE_IMAGE_BY_STATE;

  const clearMouthAnimation = () => {
    if (animationTimerRef.current !== null) {
      window.clearTimeout(animationTimerRef.current);
      animationTimerRef.current = null;
    }
  };

  const resetMouth = () => {
    clearMouthAnimation();
    setMouthState("closed");
  };

  const runMouthAnimationLoop = () => {
    clearMouthAnimation();

    const tick = () => {
      if (!audioRef.current || audioRef.current.paused) {
        resetMouth();
        return;
      }

      setMouthState(pickNextMouthState());
      animationTimerRef.current = window.setTimeout(tick, nextRandomDelayMs());
    };

    animationTimerRef.current = window.setTimeout(tick, nextRandomDelayMs());
  };

  const stopAudio = () => {
    if (!audioRef.current) {
      resetMouth();
      setAudioPlaying(false);
      return;
    }

    audioRef.current.pause();
    audioRef.current.currentTime = 0;
    setAudioPlaying(false);
    resetMouth();
  };

  const playAudioFromStart = async () => {
    if (!audioRef.current || !audioSrc) {
      return;
    }

    try {
      audioRef.current.currentTime = 0;
      await audioRef.current.play();
    } catch {
      setAudioPlaying(false);
      resetMouth();
    }
  };

  useEffect(() => {
    if (!audioSrc) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
      setAudioPlaying(false);
      resetMouth();
      return;
    }

    stopAudio();

    const audio = new Audio(audioSrc);
    audio.preload = "auto";

    audio.onplay = () => {
      setAudioPlaying(true);
      runMouthAnimationLoop();
    };

    audio.onended = () => {
      setAudioPlaying(false);
      resetMouth();
    };

    audio.onpause = () => {
      setAudioPlaying(false);
      resetMouth();
    };

    audio.onerror = () => {
      setAudioPlaying(false);
      resetMouth();
    };

    audioRef.current = audio;

    if (shouldPlay) {
      void playAudioFromStart();
    }

    return () => {
      audio.pause();
      audio.src = "";
      audio.onplay = null;
      audio.onended = null;
      audio.onpause = null;
      audio.onerror = null;
      if (audioRef.current === audio) {
        audioRef.current = null;
      }
      clearMouthAnimation();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audioSrc]);

  useEffect(() => {
    if (!audioRef.current) {
      return;
    }

    if (shouldPlay) {
      void playAudioFromStart();
      return;
    }

    stopAudio();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shouldPlay]);

  useEffect(() => {
    return () => {
      clearMouthAnimation();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.src = "";
        audioRef.current = null;
      }
    };
  }, []);

  const mouthClass =
    mouthState === "wide"
      ? styles.avatarWide
      : mouthState === "open"
        ? styles.avatarOpen
        : styles.avatarClosed;

  return (
    <div className={isFluid ? styles.avatarWrapFluid : styles.avatarWrap}>
      <div className={isFluid ? styles.avatarStageFluid : styles.avatarStage}>
        <Image
          src={activeFaceSet[mouthState]}
          alt="Talking avatar"
          width={512}
          height={512}
          className={`${styles.avatarImage} ${mouthClass}`}
        />
      </div>
      {!isFluid && <div className={styles.statusPill}>{audioPlaying ? "Speaking" : "Idle"}</div>}
    </div>
  );
}
