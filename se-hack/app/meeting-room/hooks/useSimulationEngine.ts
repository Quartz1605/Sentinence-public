"use client";

import { useEffect, useMemo, useRef } from "react";

import { candidateId } from "../mock-data";
import { useMeetingRoomStore } from "../store";

const randomBetweenInt = (min: number, max: number): number => {
  return Math.floor(Math.random() * (max - min + 1)) + min;
};

const randomPick = <T,>(list: T[]): T => {
  return list[Math.floor(Math.random() * list.length)];
};

export function useSimulationEngine() {
  const participants = useMeetingRoomStore((state) => state.participants);
  const sessionEnded = useMeetingRoomStore((state) => state.sessionEnded);

  const aiParticipantIds = useMemo(
    () => participants.filter((participant) => participant.isAi).map((participant) => participant.id),
    [participants],
  );

  const actionTimerRef = useRef<number | null>(null);
  const speechTimerRef = useRef<number | null>(null);
  const helpTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const secondTicker = window.setInterval(() => {
      useMeetingRoomStore.getState().tickSecond();
    }, 1000);

    const analyticsTicker = window.setInterval(() => {
      useMeetingRoomStore.getState().updateMetricsPulse();
    }, 1600);

    return () => {
      window.clearInterval(secondTicker);
      window.clearInterval(analyticsTicker);
    };
  }, []);

  useEffect(() => {
    if (sessionEnded || aiParticipantIds.length === 0) {
      if (actionTimerRef.current) window.clearInterval(actionTimerRef.current);
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
      if (helpTimerRef.current) window.clearTimeout(helpTimerRef.current);
      return;
    }

    actionTimerRef.current = window.setInterval(() => {
      const state = useMeetingRoomStore.getState();
      if (state.sessionEnded) {
        return;
      }

      const eventRoll = Math.random();

      if (eventRoll < 0.42) {
        const speakerId = randomPick(aiParticipantIds);
        state.startAiSpeakingTurn(speakerId);

        if (speechTimerRef.current) {
          window.clearTimeout(speechTimerRef.current);
        }

        speechTimerRef.current = window.setTimeout(() => {
          useMeetingRoomStore.getState().stopAiSpeakingTurn(speakerId);
        }, randomBetweenInt(1900, 4200));
        return;
      }

      if (eventRoll < 0.74) {
        const authorId = randomPick(aiParticipantIds);
        state.setTypingAgent(authorId);

        window.setTimeout(() => {
          const nextState = useMeetingRoomStore.getState();
          if (nextState.sessionEnded) return;
          nextState.addAiMessage(authorId);
          nextState.setTypingAgent(null);
        }, randomBetweenInt(700, 1500));
        return;
      }

      if (eventRoll < 0.9) {
        const teammateId = randomPick(aiParticipantIds);
        state.triggerHelpSignal(teammateId);

        if (helpTimerRef.current) {
          window.clearTimeout(helpTimerRef.current);
        }

        helpTimerRef.current = window.setTimeout(() => {
          useMeetingRoomStore.getState().clearHelpSignal(teammateId);
        }, randomBetweenInt(3500, 6200));
        return;
      }

      state.registerInterruption();

      if (Math.random() > 0.56) {
        const interrupterId = randomPick(aiParticipantIds);
        state.addAiMessage(interrupterId, "Quick interruption: we need a decision owner before this branches further.");
      } else {
        state.addCandidateMessage("I want to realign us: one owner for containment, one for root-cause analysis.");
        const candidate = state.participants.find((participant) => participant.id === candidateId);
        if (candidate && !candidate.isMuted) {
          state.startAiSpeakingTurn(candidateId);
          window.setTimeout(() => {
            useMeetingRoomStore.getState().stopAiSpeakingTurn(candidateId);
          }, randomBetweenInt(1200, 2600));
        }
      }
    }, randomBetweenInt(2000, 3300));

    return () => {
      if (actionTimerRef.current) window.clearInterval(actionTimerRef.current);
      if (speechTimerRef.current) window.clearTimeout(speechTimerRef.current);
      if (helpTimerRef.current) window.clearTimeout(helpTimerRef.current);
    };
  }, [sessionEnded, aiParticipantIds]);
}
