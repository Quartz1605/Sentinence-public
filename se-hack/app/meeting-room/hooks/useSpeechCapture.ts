"use client";

import { useCallback, useRef, useState } from "react";

type RecordedAudio = {
  audioBase64: string;
  mimeType: string;
};

export function useSpeechCapture() {
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);

  const getErrorMessage = (err: unknown, fallback: string): string => {
    if (err instanceof Error && err.message) {
      return err.message;
    }
    return fallback;
  };

  const startRecording = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, {
        mimeType: MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm",
      });
      mediaRecorderRef.current = recorder;
      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.start();
      setRecording(true);
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to start microphone recording"));
      setRecording(false);
    }
  }, []);

  const stopRecording = useCallback(async (): Promise<RecordedAudio | null> => {
    const recorder = mediaRecorderRef.current;
    if (!recorder) {
      return null;
    }

    const stoppedBlob = await new Promise<Blob | null>((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" });
        resolve(blob.size > 0 ? blob : null);
      };

      try {
        recorder.stop();
      } catch {
        resolve(null);
      }
    });

    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    setRecording(false);

    if (!stoppedBlob) {
      return null;
    }

    const mimeType = stoppedBlob.type || "audio/webm";
    const arrayBuffer = await stoppedBlob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }

    return {
      audioBase64: btoa(binary),
      mimeType,
    };
  }, []);

  return {
    recording,
    error,
    startRecording,
    stopRecording,
  };
}
