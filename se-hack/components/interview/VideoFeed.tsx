"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, MicOff, Video, VideoOff } from "lucide-react";
import { Card } from "@/components/ui/Card";

export function VideoFeed() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [hasVideo, setHasVideo] = useState(true);
  const [hasMic, setHasMic] = useState(true);
  const [stream, setStream] = useState<MediaStream | null>(null);

  useEffect(() => {
    async function setupStream() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: true,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err) {
        console.error("Error accessing media devices.", err);
        setHasVideo(false);
        setHasMic(false);
      }
    }
    setupStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return (
    <Card className="relative overflow-hidden aspect-video bg-black rounded-2xl flex items-center justify-center border-zinc-800">
      {hasVideo ? (
        <video
          ref={videoRef}
          autoPlay
          muted
          playsInline
          className="w-full h-full object-cover scale-x-[-1]"
        />
      ) : (
        <div className="flex flex-col items-center justify-center text-zinc-500">
          <VideoOff className="w-12 h-12 mb-2" />
          <p>Camera is disabled or unavailable</p>
        </div>
      )}

      {/* Mic/Video Status Overlays */}
      <div className="absolute bottom-4 left-4 flex gap-2">
        <div className={`p-2 rounded-full backdrop-blur-md ${hasMic ? 'bg-zinc-900/50 text-white' : 'bg-red-500/80 text-white'}`}>
          {hasMic ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
        </div>
        <div className={`p-2 rounded-full backdrop-blur-md ${hasVideo ? 'bg-zinc-900/50 text-white' : 'bg-red-500/80 text-white'}`}>
          {hasVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
        </div>
      </div>
    </Card>
  );
}
