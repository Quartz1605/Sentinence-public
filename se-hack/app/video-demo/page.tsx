"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import axios from "axios";
import {
  Camera, CameraOff, AlertCircle, Activity, Smile,
  Eye, Focus, Compass, MousePointer2
} from "lucide-react";

// --- Types ---
interface AnalysisResponse {
  confidence_score: number;
  engagement_score: number;
  dominant_emotion: string;
  pose_detected: boolean;
  face_detected: boolean;
  details: {
    shoulder_alignment?: { angle_deg: number; is_aligned: boolean; score: number };
    posture?: { spine_angle_deg: number; is_upright: boolean; score: number };
    nervous_gestures?: { face_touch_count: number; is_touching_face: boolean; fidgeting_score: number; score: number };
    head_pose?: { pitch: number; yaw: number; roll: number; looking_at_screen: boolean };
    gaze?: { left_pupil_ratio: number[]; right_pupil_ratio: number[]; direction: string };
    emotion_breakdown: Record<string, number>;
  };
}

// --- Aggregation helpers ---

/** Average numeric fields from an array of AnalysisResponse into one aggregated response. */
function aggregateResults(results: AnalysisResponse[]): AnalysisResponse {
  const n = results.length;
  if (n === 0) throw new Error("Cannot aggregate zero results");

  const avg = (vals: number[]) => vals.reduce((a, b) => a + b, 0) / vals.length;

  // Pick the most frequent dominant emotion
  const emotionCounts: Record<string, number> = {};
  for (const r of results) {
    const e = r.dominant_emotion;
    emotionCounts[e] = (emotionCounts[e] || 0) + 1;
  }
  const dominantEmotion = Object.entries(emotionCounts).sort(([, a], [, b]) => b - a)[0][0];

  // Average emotion breakdown
  const allBreakdowns = results.map(r => r.details.emotion_breakdown || {});
  const emotionKeys = new Set(allBreakdowns.flatMap(b => Object.keys(b)));
  const avgBreakdown: Record<string, number> = {};
  for (const key of emotionKeys) {
    avgBreakdown[key] = avg(allBreakdowns.map(b => b[key] ?? 0));
  }

  // Boolean fields: majority vote
  const majority = (vals: boolean[]) => vals.filter(Boolean).length > vals.length / 2;

  // Use the last result's face_touch_count (it's cumulative from backend)
  const lastResult = results[results.length - 1];

  return {
    confidence_score: avg(results.map(r => r.confidence_score)),
    engagement_score: avg(results.map(r => r.engagement_score)),
    dominant_emotion: dominantEmotion,
    pose_detected: majority(results.map(r => r.pose_detected)),
    face_detected: majority(results.map(r => r.face_detected)),
    details: {
      shoulder_alignment: {
        angle_deg: avg(results.filter(r => r.details.shoulder_alignment).map(r => r.details.shoulder_alignment!.angle_deg)),
        is_aligned: majority(results.filter(r => r.details.shoulder_alignment).map(r => r.details.shoulder_alignment!.is_aligned)),
        score: avg(results.filter(r => r.details.shoulder_alignment).map(r => r.details.shoulder_alignment!.score)),
      },
      posture: {
        spine_angle_deg: avg(results.filter(r => r.details.posture).map(r => r.details.posture!.spine_angle_deg)),
        is_upright: majority(results.filter(r => r.details.posture).map(r => r.details.posture!.is_upright)),
        score: avg(results.filter(r => r.details.posture).map(r => r.details.posture!.score)),
      },
      nervous_gestures: {
        face_touch_count: lastResult.details.nervous_gestures?.face_touch_count ?? 0,
        is_touching_face: majority(results.filter(r => r.details.nervous_gestures).map(r => r.details.nervous_gestures!.is_touching_face)),
        fidgeting_score: avg(results.filter(r => r.details.nervous_gestures).map(r => r.details.nervous_gestures!.fidgeting_score)),
        score: avg(results.filter(r => r.details.nervous_gestures).map(r => r.details.nervous_gestures!.score)),
      },
      head_pose: {
        pitch: avg(results.filter(r => r.details.head_pose).map(r => r.details.head_pose!.pitch)),
        yaw: avg(results.filter(r => r.details.head_pose).map(r => r.details.head_pose!.yaw)),
        roll: avg(results.filter(r => r.details.head_pose).map(r => r.details.head_pose!.roll)),
        looking_at_screen: majority(results.filter(r => r.details.head_pose).map(r => r.details.head_pose!.looking_at_screen)),
      },
      gaze: {
        left_pupil_ratio: [
          avg(results.filter(r => r.details.gaze).map(r => r.details.gaze!.left_pupil_ratio[0])),
          avg(results.filter(r => r.details.gaze).map(r => r.details.gaze!.left_pupil_ratio[1])),
        ],
        right_pupil_ratio: [
          avg(results.filter(r => r.details.gaze).map(r => r.details.gaze!.right_pupil_ratio[0])),
          avg(results.filter(r => r.details.gaze).map(r => r.details.gaze!.right_pupil_ratio[1])),
        ],
        direction: lastResult.details.gaze?.direction ?? "center",
      },
      emotion_breakdown: avgBreakdown,
    },
  };
}

export default function VideoDemoPage() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reqCount, setReqCount] = useState(0);
  const [fps, setFps] = useState(0);

  // Buffer for per-frame results that get aggregated every second
  const frameBufferRef = useRef<AnalysisResponse[]>([]);
  const isProcessingRef = useRef(false);

  // Initialize Webcam
  useEffect(() => {
    async function setupStream() {
      try {
        const mediaStream = await navigator.mediaDevices.getUserMedia({
          video: { width: 640, height: 480 },
          audio: false,
        });
        setStream(mediaStream);
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      } catch (err: any) {
        setError(`Failed to access camera: ${err.message}`);
      }
    }
    setupStream();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Capture a single frame and push result to the buffer (no UI update here)
  const captureAndBuffer = useCallback(async () => {
    if (!videoRef.current || !canvasRef.current || isProcessingRef.current || !isCapturing) return;

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
  }, [isCapturing]);

  // Fire capture at ~12 FPS (every 83 ms)
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCapturing) {
      interval = setInterval(() => {
        captureAndBuffer();
      }, 83);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCapturing, captureAndBuffer]);

  // Every 1 second, aggregate the buffered results and flush
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isCapturing) {
      interval = setInterval(() => {
        const buffer = frameBufferRef.current;
        if (buffer.length > 0) {
          try {
            const aggregated = aggregateResults(buffer);
            setAnalysis(aggregated);
            setFps(buffer.length);
          } catch {
            // ignore aggregation errors
          }
          frameBufferRef.current = [];
        }
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [isCapturing]);

  const toggleCapture = () => {
    setIsCapturing(!isCapturing);
    if (!isCapturing) {
      setError(null);
      frameBufferRef.current = [];
    }
  };

  return (
    <div className="min-h-screen bg-black text-white p-6 md:p-12 font-sans overflow-x-hidden">
      <div className="max-w-7xl mx-auto space-y-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-emerald-400">
              Live Behavioral Analysis
            </h1>
            <p className="text-zinc-400 mt-1">Real-time forensic breakdown of video performance metrics.</p>
          </div>

          <div className="flex items-center gap-4">
            <span className="text-xs text-zinc-500 font-mono">FRAMES: {reqCount} · {fps} FPS</span>
            <button
              onClick={toggleCapture}
              disabled={!stream}
              className={`flex items-center gap-2 px-6 py-2.5 rounded-full font-medium transition-all ${isCapturing
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20 shadow-[0_0_20px_rgba(239,68,68,0.2)]'
                : 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.2)]'
                } disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isCapturing ? <CameraOff className="w-5 h-5" /> : <Camera className="w-5 h-5" />}
              {isCapturing ? 'Stop Analysis' : 'Start Analysis'}
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 px-4 py-3 rounded-xl flex items-center gap-3">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p className="text-sm">{error}</p>
          </div>
        )}

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">

          {/* Left: Video Feed */}
          <div className="lg:col-span-5 flex flex-col gap-4">
            <div className={`relative overflow-hidden rounded-2xl bg-zinc-900 border border-zinc-800 aspect-video shadow-2xl transition-all duration-500 ${isCapturing ? 'shadow-blue-500/10 border-blue-500/30' : ''}`}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                className="w-full h-full object-cover scale-x-[-1]"
              />
              <canvas ref={canvasRef} className="hidden" />

              {/* Overlays */}
              <div className="absolute top-4 left-4 flex gap-2">
                <div className="px-3 py-1 rounded-full bg-black/60 backdrop-blur-md text-xs font-mono font-medium border border-white/10 flex items-center gap-2">
                  <div className={`w-2 h-2 rounded-full ${isCapturing ? 'bg-emerald-500 animate-pulse' : 'bg-zinc-500'}`} />
                  {isCapturing ? 'LIVE' : 'IDLE'}
                </div>
              </div>

              {analysis && isCapturing && (
                <div className="absolute bottom-4 left-4 right-4 flex justify-between items-end">
                  <div className="px-3 py-1.5 rounded-xl bg-black/60 backdrop-blur-md border border-white/10 text-sm">
                    <span className="text-zinc-400">Emotion:</span> <span className="font-semibold text-white capitalize">{analysis.dominant_emotion}</span>
                  </div>
                  {!analysis.face_detected && (
                    <div className="text-xs text-red-400 bg-red-500/20 px-2 py-1 rounded border border-red-500/30">No Face detected</div>
                  )}
                </div>
              )}
            </div>

            {/* Overall Scores */}
            <div className="grid grid-cols-2 gap-4">
              <ScoreCard title="Engagement" score={analysis?.engagement_score} color="emerald" />
              <ScoreCard title="Confidence" score={analysis?.confidence_score} color="blue" />
            </div>
          </div>

          {/* Right: Metrics Panel */}
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="bg-zinc-900/50 border border-zinc-800 rounded-3xl p-6 md:p-8 backdrop-blur-sm h-full flex flex-col">
              <h3 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <Activity className="w-5 h-5 text-purple-400" />
                Diagnostic Telemetry
              </h3>

              {analysis ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 flex-1">

                  {/* Detailed Metrics Group 1 */}
                  <div className="space-y-6">
                    <MetricBlock
                      icon={<Smile className="w-4 h-4 text-pink-400" />}
                      title="Emotion Distribution"
                    >
                      <div className="space-y-3 mt-2">
                        {Object.entries(analysis.details.emotion_breakdown || {})
                          .sort(([, a], [, b]) => b - a)
                          .slice(0, 3)
                          .map(([emotion, val]) => (
                            <div key={emotion}>
                              <div className="flex justify-between text-xs mb-1">
                                <span className="capitalize text-zinc-300">{emotion}</span>
                                <span className="font-mono text-zinc-400">{(val * 100).toFixed(1)}%</span>
                              </div>
                              <ProgressBar value={val} color="bg-pink-500" />
                            </div>
                          ))}
                      </div>
                    </MetricBlock>

                    <MetricBlock
                      icon={<Focus className="w-4 h-4 text-orange-400" />}
                      title="Head Pose & Posture"
                    >
                      <div className="grid grid-cols-2 gap-3 mt-2">
                        <DataPip label="Upright" active={analysis.details.posture?.is_upright} val={analysis.details.posture?.score} />
                        <DataPip label="Shoulders" active={analysis.details.shoulder_alignment?.is_aligned} val={analysis.details.shoulder_alignment?.score} />
                        <DataPip label="Facing Screen" active={analysis.details.head_pose?.looking_at_screen} />
                      </div>
                    </MetricBlock>
                  </div>

                  {/* Detailed Metrics Group 2 */}
                  <div className="space-y-6">
                    <MetricBlock
                      icon={<Eye className="w-4 h-4 text-cyan-400" />}
                      title="Gaze Analysis"
                    >
                      <div className="mt-2 space-y-4">
                        <div>
                          <div className="flex justify-between text-xs mb-1 text-zinc-400">Direction</div>
                          <div className="font-semibold text-lg capitalize text-cyan-50">{analysis.details.gaze?.direction || 'Unknown'}</div>
                        </div>

                        {analysis.details.gaze?.left_pupil_ratio && (
                          <div className="text-xs bg-black/40 rounded-lg p-3 border border-white/5 font-mono text-zinc-400 grid grid-cols-2 gap-2">
                            <div>L: [{analysis.details.gaze.left_pupil_ratio[0].toFixed(2)}, {analysis.details.gaze.left_pupil_ratio[1].toFixed(2)}]</div>
                            <div>R: [{analysis.details.gaze.right_pupil_ratio[0].toFixed(2)}, {analysis.details.gaze.right_pupil_ratio[1].toFixed(2)}]</div>
                          </div>
                        )}
                      </div>
                    </MetricBlock>

                    <MetricBlock
                      icon={<MousePointer2 className="w-4 h-4 text-yellow-400" />}
                      title="Nervous Gestures"
                    >
                      <div className="mt-2 text-sm space-y-2">
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                          <span className="text-zinc-400">Touching Face</span>
                          <span className={analysis.details.nervous_gestures?.is_touching_face ? "text-yellow-400 font-medium" : "text-emerald-400"}>
                            {analysis.details.nervous_gestures?.is_touching_face ? 'Yes' : 'No'}
                          </span>
                        </div>
                        <div className="flex justify-between items-center py-1 border-b border-white/5">
                          <span className="text-zinc-400">Face Touches</span>
                          <span className="font-mono">{analysis.details.nervous_gestures?.face_touch_count || 0}</span>
                        </div>
                        <div className="flex justify-between items-center py-1">
                          <span className="text-zinc-400">Fidgeting</span>
                          <span>{analysis.details.nervous_gestures ? (analysis.details.nervous_gestures.fidgeting_score * 100).toFixed(0) + '%' : '0%'}</span>
                        </div>
                      </div>
                    </MetricBlock>
                  </div>
                </div>
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-zinc-600 space-y-4">
                  <Compass className="w-12 h-12 stroke-1 opacity-20" />
                  <p className="text-sm">Start analysis to receive telemetry</p>
                </div>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

// --- Subcomponents ---

function ScoreCard({ title, score, color }: { title: string, score?: number, color: 'emerald' | 'blue' }) {
  const isLoaded = typeof score === 'number';
  const displayScore = isLoaded ? (score! * 100).toFixed(0) : '--';

  const gradients = {
    emerald: 'from-emerald-500 to-teal-400 shadow-emerald-500/20',
    blue: 'from-blue-500 to-indigo-400 shadow-blue-500/20'
  };

  return (
    <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 relative overflow-hidden group">
      <div className={`absolute inset-0 bg-gradient-to-br ${gradients[color]} opacity-0 group-hover:opacity-5 transition-opacity duration-500`} />
      <h4 className="text-sm text-zinc-400 font-medium mb-1">{title}</h4>
      <div className="flex items-baseline gap-1">
        <span className={`text-4xl font-bold tracking-tight ${isLoaded ? 'text-white' : 'text-zinc-700'}`}>
          {displayScore}
        </span>
        {isLoaded && <span className="text-zinc-500 text-sm font-medium">%</span>}
      </div>
      {isLoaded && (
        <div className="mt-4 h-1.5 w-full bg-zinc-800 rounded-full overflow-hidden">
          <div
            className={`h-full bg-gradient-to-r ${gradients[color]} transition-all duration-500 ease-out`}
            style={{ width: `${score! * 100}%` }}
          />
        </div>
      )}
    </div>
  );
}

function MetricBlock({ icon, title, children }: { icon: React.ReactNode, title: string, children: React.ReactNode }) {
  return (
    <div className="bg-black/30 border border-white/5 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h4 className="font-medium text-sm text-zinc-200">{title}</h4>
      </div>
      {children}
    </div>
  );
}

function ProgressBar({ value, color }: { value: number, color: string }) {
  return (
    <div className="w-full h-1.5 bg-zinc-800 rounded-full overflow-hidden">
      <div
        className={`h-full ${color} transition-all duration-300 ease-out`}
        style={{ width: `${value * 100}%` }}
      />
    </div>
  );
}

function DataPip({ label, active, val }: { label: string, active?: boolean, val?: number }) {
  return (
    <div className="flex flex-col gap-1 p-2 bg-black/40 rounded-xl border border-white/5">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <div className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'}`} />
          <span className="text-sm font-medium text-zinc-300">{active ? 'Yes' : 'No'}</span>
        </div>
        {typeof val === 'number' && (
          <span className="text-xs font-mono text-zinc-500">{(val * 100).toFixed(0)}%</span>
        )}
      </div>
    </div>
  );
}
