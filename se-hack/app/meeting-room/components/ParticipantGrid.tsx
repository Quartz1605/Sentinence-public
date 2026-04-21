"use client";

import { Participant } from "../types";
import { ParticipantCard } from "./ParticipantCard";

type ParticipantGridProps = {
  participants: Participant[];
  activeSpeakerId: string | null;
  cameraEnabledForCandidate: boolean;
  videoRef?: React.RefObject<HTMLVideoElement | null>;
  dominantEmotion?: string | null;
};

export function ParticipantGrid({
  participants,
  activeSpeakerId,
  cameraEnabledForCandidate,
  videoRef,
  dominantEmotion,
}: ParticipantGridProps) {
  return (
    <section className="rounded-2xl border border-violet-200/25 bg-black/35 p-2 sm:p-3">
      <div className="grid gap-2 md:grid-cols-3">
        {participants.slice(0, 3).map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            isActiveSpeaker={participant.id === activeSpeakerId}
            cameraEnabledForCandidate={cameraEnabledForCandidate}
            videoRef={!participant.isAi ? videoRef : undefined}
            dominantEmotion={!participant.isAi ? dominantEmotion : null}
          />
        ))}
      </div>

      <div className="mt-2 grid gap-2 md:grid-cols-2 md:px-10">
        {participants.slice(3).map((participant) => (
          <ParticipantCard
            key={participant.id}
            participant={participant}
            isActiveSpeaker={participant.id === activeSpeakerId}
            cameraEnabledForCandidate={cameraEnabledForCandidate}
            videoRef={!participant.isAi ? videoRef : undefined}
            dominantEmotion={!participant.isAi ? dominantEmotion : null}
          />
        ))}
      </div>
    </section>
  );
}

