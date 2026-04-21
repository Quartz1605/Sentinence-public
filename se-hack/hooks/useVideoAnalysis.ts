import { useCallback, useRef, useState } from "react";
import axios from "axios";

// Types matching the backend video analysis response
export interface VideoAnalysis {
  captured_at: number;
  confidence_score: number;
  engagement_score: number;
  dominant_emotion: string;
  pose_detected: boolean;
  face_detected: boolean;
  details: {
    shoulder_alignment?: { angle_deg: number; is_aligned: boolean; score: number };
    posture?: { spine_angle_deg: number; is_upright: boolean; score: number };
    nervous_gestures?: {
      face_touch_count: number;
      is_touching_face: boolean;
      fidgeting_score: number;
      score: number;
    };
    head_pose?: { pitch: number; yaw: number; roll: number; looking_at_screen: boolean };
    gaze?: { left_pupil_ratio: number[]; right_pupil_ratio: number[]; direction: string };
    emotion_breakdown: Record<string, number>;
  };
}

function aggregateResults(results: VideoAnalysis[]): VideoAnalysis {
  const n = results.length;
  if (n === 0) throw new Error("Cannot aggregate zero results");

  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;
  const majority = (vals: boolean[]) => vals.filter(Boolean).length > vals.length / 2;

  // Most frequent emotion
  const emotionCounts: Record<string, number> = {};
  for (const r of results) {
    const e = r.dominant_emotion;
    emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  }
  const dominantEmotion = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a)[0][0];

  // Average emotion breakdown
  const allBreakdowns = results.map((r) => r.details.emotion_breakdown || {});
  const emotionKeys = new Set(allBreakdowns.flatMap((b) => Object.keys(b)));
  const avgBreakdown: Record<string, number> = {};
  for (const key of emotionKeys) {
    avgBreakdown[key] = avg(allBreakdowns.map((b) => b[key] ?? 0));
  }

  const lastResult = results[results.length - 1];

  return {
    captured_at: Date.now(),
    confidence_score: avg(results.map((r) => r.confidence_score)),
    engagement_score: avg(results.map((r) => r.engagement_score)),
    dominant_emotion: dominantEmotion,
    pose_detected: majority(results.map((r) => r.pose_detected)),
    face_detected: majority(results.map((r) => r.face_detected)),
    details: {
      shoulder_alignment: {
        angle_deg: avg(
          results.filter((r) => r.details.shoulder_alignment).map((r) => r.details.shoulder_alignment!.angle_deg)
        ),
        is_aligned: majority(
          results.filter((r) => r.details.shoulder_alignment).map((r) => r.details.shoulder_alignment!.is_aligned)
        ),
        score: avg(
          results.filter((r) => r.details.shoulder_alignment).map((r) => r.details.shoulder_alignment!.score)
        ),
      },
      posture: {
        spine_angle_deg: avg(
          results.filter((r) => r.details.posture).map((r) => r.details.posture!.spine_angle_deg)
        ),
        is_upright: majority(
          results.filter((r) => r.details.posture).map((r) => r.details.posture!.is_upright)
        ),
        score: avg(results.filter((r) => r.details.posture).map((r) => r.details.posture!.score)),
      },
      nervous_gestures: {
        face_touch_count: lastResult.details.nervous_gestures?.face_touch_count ?? 0,
        is_touching_face: majority(
          results
            .filter((r) => r.details.nervous_gestures)
            .map((r) => r.details.nervous_gestures!.is_touching_face)
        ),
        fidgeting_score: avg(
          results
            .filter((r) => r.details.nervous_gestures)
            .map((r) => r.details.nervous_gestures!.fidgeting_score)
        ),
        score: avg(
          results.filter((r) => r.details.nervous_gestures).map((r) => r.details.nervous_gestures!.score)
        ),
      },
      head_pose: {
        pitch: avg(results.filter((r) => r.details.head_pose).map((r) => r.details.head_pose!.pitch)),
        yaw: avg(results.filter((r) => r.details.head_pose).map((r) => r.details.head_pose!.yaw)),
        roll: avg(results.filter((r) => r.details.head_pose).map((r) => r.details.head_pose!.roll)),
        looking_at_screen: majority(
          results.filter((r) => r.details.head_pose).map((r) => r.details.head_pose!.looking_at_screen)
        ),
      },
      gaze: {
        left_pupil_ratio: [
          avg(results.filter((r) => r.details.gaze).map((r) => r.details.gaze!.left_pupil_ratio[0])),
          avg(results.filter((r) => r.details.gaze).map((r) => r.details.gaze!.left_pupil_ratio[1])),
        ],
        right_pupil_ratio: [
          avg(results.filter((r) => r.details.gaze).map((r) => r.details.gaze!.right_pupil_ratio[0])),
          avg(results.filter((r) => r.details.gaze).map((r) => r.details.gaze!.right_pupil_ratio[1])),
        ],
        direction: lastResult.details.gaze?.direction ?? "center",
      },
      emotion_breakdown: avgBreakdown,
    },
  };
}

export interface UseVideoAnalysisReturn {
  analysis: VideoAnalysis | null;
  isCapturing: boolean;
  fps: number;
  reqCount: number;
  error: string | null;
  startCapture: () => void;
  stopCapture: () => void;
}

export function useVideoAnalysis(
  videoRef: React.RefObject<HTMLVideoElement | null>,
  canvasRef: React.RefObject<HTMLCanvasElement | null>
): UseVideoAnalysisReturn {
  const [isCapturing, setIsCapturing] = useState(false);
  const [analysis, setAnalysis] = useState<VideoAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reqCount, setReqCount] = useState(0);
  const [fps, setFps] = useState(0);

  const frameBufferRef = useRef<VideoAnalysis[]>([]);
  const isProcessingRef = useRef(false);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const aggregateIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const captureAndBuffer = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessingRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    isProcessingRef.current = true;
    try {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const res = await axios.post("http://127.0.0.1:8000/video/analyze-frame", {
          frame: dataUrl,
        });

        frameBufferRef.current.push(res.data);
        setReqCount((prev) => prev + 1);
        setError(null);
      }
    } catch (err: any) {
      if (err.code === "ERR_NETWORK") {
        setError("Backend connection refused. Ensure http://127.0.0.1:8000 is running.");
      }
    } finally {
      isProcessingRef.current = false;
    }
  }, [videoRef, canvasRef]);

  const startCapture = useCallback(() => {
    setIsCapturing(true);
    setError(null);
    frameBufferRef.current = [];

    // Capture at ~12 FPS
    captureIntervalRef.current = setInterval(() => {
      captureAndBuffer();
    }, 83);

    // Aggregate every 1s
    aggregateIntervalRef.current = setInterval(() => {
      const buffer = frameBufferRef.current;
      if (buffer.length > 0) {
        try {
          const aggregated = aggregateResults(buffer);
          setAnalysis(aggregated);
          setFps(buffer.length);
        } catch {
          // ignore
        }
        frameBufferRef.current = [];
      }
    }, 1000);
  }, [captureAndBuffer]);

  const stopCapture = useCallback(() => {
    setIsCapturing(false);
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    if (aggregateIntervalRef.current) {
      clearInterval(aggregateIntervalRef.current);
      aggregateIntervalRef.current = null;
    }
  }, []);

  return { analysis, isCapturing, fps, reqCount, error, startCapture, stopCapture };
}
