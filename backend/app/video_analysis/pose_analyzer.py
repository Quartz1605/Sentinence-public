"""
Pose Analyzer — Skeletal coordinates, shoulder alignment,
posture scoring, and nervous gesture detection.

Uses MediaPipe Tasks API — PoseLandmarker (33 body landmarks)
and HandLandmarker (21 per hand) to perform kinematic analysis
on interview candidates.
"""

import math
import os
from collections import deque
from typing import Dict, Any, Optional, List, Tuple

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    PoseLandmarker,
    PoseLandmarkerOptions,
    HandLandmarker,
    HandLandmarkerOptions,
    RunningMode,
)

from app.video_analysis.utils import (
    euclidean_distance,
    calculate_angle,
    clamp,
    LandmarkSmoother,
)

# ── Model paths ──────────────────────────────────────────────────────

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
_POSE_MODEL = os.path.join(_MODELS_DIR, "pose_landmarker.task")
_HAND_MODEL = os.path.join(_MODELS_DIR, "hand_landmarker.task")


class PoseAnalyzer:
    """
    Extracts body pose and hand landmarks from video frames
    and computes confidence-related behavioral metrics.

    Features:
        - 33-point skeletal coordinate extraction
        - Shoulder alignment (tilt angle)
        - Spine posture scoring
        - Nervous gesture detection (face-touching, fidgeting)
    """

    # Temporal window size for gesture detection (frames)
    GESTURE_WINDOW_SIZE = 30

    # Thresholds
    SHOULDER_TILT_MAX_DEG = 35.0       # Max tilt before score hits 0
    SPINE_DEVIATION_MAX_DEG = 45.0     # Max slouch before score hits 0
    FACE_TOUCH_DISTANCE_THRESHOLD = 0.15  # Normalized distance (tighter = more precise)
    FIDGET_VARIANCE_THRESHOLD = 0.005  # Normalized variance
    FACE_TOUCH_SUSTAIN_FRAMES = 18     # ~1.5 sec at 12 FPS before counting a touch

    def __init__(self):
        """Initialize MediaPipe Tasks for pose and hand detection."""
        # Pose Landmarker
        pose_options = PoseLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_POSE_MODEL),
            running_mode=RunningMode.IMAGE,
            num_poses=1,
            min_pose_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.pose = PoseLandmarker.create_from_options(pose_options)

        # Hand Landmarker
        hand_options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_HAND_MODEL),
            running_mode=RunningMode.IMAGE,
            num_hands=2,
            min_hand_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )
        self.hands = HandLandmarker.create_from_options(hand_options)

        # Temporal buffers for gesture detection
        self._wrist_history: deque = deque(maxlen=self.GESTURE_WINDOW_SIZE)
        self._face_touch_history: deque = deque(maxlen=self.GESTURE_WINDOW_SIZE)

        # Sustained face-touch tracking
        self._consecutive_touch_frames: int = 0
        self._confirmed_touch_count: int = 0

        # Landmark smoother for pose stability
        self._pose_smoother = LandmarkSmoother(alpha=0.4)

    def analyze_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Run full pose analysis on a single frame.

        Args:
            frame: OpenCV BGR image.

        Returns:
            Dictionary with all pose metrics and sub-scores.
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape

        # Convert to MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB, data=rgb_frame
        )

        # ── Run MediaPipe Pose ──
        pose_results = self.pose.detect(mp_image)
        # ── Run MediaPipe Hands ──
        hands_results = self.hands.detect(mp_image)

        result = {
            "pose_detected": False,
            "hands_detected": False,
            "shoulder_alignment": None,
            "posture": None,
            "nervous_gestures": None,
            "body_confidence": 0.0,
            "landmarks": None,
        }

        if not pose_results.pose_landmarks or len(pose_results.pose_landmarks) == 0:
            return result

        result["pose_detected"] = True
        landmarks = pose_results.pose_landmarks[0]  # First (only) person

        # Extract raw coordinates as array for smoothing
        raw_coords = np.array(
            [[lm.x, lm.y, lm.z] for lm in landmarks]
        )
        smoothed_coords = self._pose_smoother.smooth(raw_coords)

        # Visibility values (Tasks API stores them separately)
        visibilities = [lm.visibility if hasattr(lm, 'visibility') and lm.visibility is not None else 0.5 for lm in landmarks]

        # Store landmark data for external use
        result["landmarks"] = {
            "body": [
                {
                    "x": float(smoothed_coords[i][0]),
                    "y": float(smoothed_coords[i][1]),
                    "z": float(smoothed_coords[i][2]),
                    "visibility": float(visibilities[i]),
                }
                for i in range(len(landmarks))
            ]
        }

        # ── Shoulder Alignment ──
        shoulder_data = self._get_shoulder_alignment(smoothed_coords, visibilities)
        result["shoulder_alignment"] = shoulder_data

        # ── Posture / Spine ──
        posture_data = self._get_posture_score(smoothed_coords, visibilities)
        result["posture"] = posture_data

        # ── Nervous Gestures ──
        hand_landmarks_list = []
        if hands_results.hand_landmarks:
            result["hands_detected"] = True
            hand_landmarks_list = hands_results.hand_landmarks

        gesture_data = self._detect_nervous_gestures(
            smoothed_coords, visibilities, hand_landmarks_list, w, h
        )
        result["nervous_gestures"] = gesture_data

        # ── Composite Body Confidence ──
        shoulder_score = shoulder_data.get("score", 0.5)
        posture_score = posture_data.get("score", 0.5)
        gesture_score = gesture_data.get("score", 0.5)

        body_confidence = (
            0.30 * shoulder_score
            + 0.35 * gesture_score
            + 0.35 * posture_score
        )
        result["body_confidence"] = round(clamp(body_confidence), 4)

        return result

    def _get_shoulder_alignment(
        self, coords: np.ndarray, visibilities: list
    ) -> Dict[str, Any]:
        """
        Calculate shoulder tilt angle and alignment score.

        Uses landmarks 11 (left shoulder) and 12 (right shoulder).
        """
        left_shoulder = coords[11]
        right_shoulder = coords[12]

        # Check visibility
        if visibilities[11] < 0.5 or visibilities[12] < 0.5:
            return {"angle_deg": 0.0, "is_aligned": True, "score": 0.5}

        y_diff = right_shoulder[1] - left_shoulder[1]
        x_diff = right_shoulder[0] - left_shoulder[0]

        angle_deg = abs(math.degrees(math.atan2(y_diff, x_diff)))
        # Normalize: 0° and 180° are level
        if angle_deg > 90:
            angle_deg = abs(180 - angle_deg)

        is_aligned = angle_deg < 15.0
        score = clamp(1.0 - (angle_deg / self.SHOULDER_TILT_MAX_DEG))

        return {
            "angle_deg": round(angle_deg, 2),
            "is_aligned": is_aligned,
            "score": round(score, 4),
        }

    def _get_posture_score(
        self, coords: np.ndarray, visibilities: list
    ) -> Dict[str, Any]:
        """
        Calculate spine/posture alignment score.

        Measures the angle formed by:
        - Nose (landmark 0)
        - Mid-shoulder point (midpoint of landmarks 11, 12)
        - Mid-hip point (midpoint of landmarks 23, 24)
        """
        key_indices = [0, 11, 12, 23, 24]
        if any(visibilities[i] < 0.4 for i in key_indices):
            return {"spine_angle_deg": 0.0, "is_upright": True, "score": 0.5}

        nose = (coords[0][0], coords[0][1])
        mid_shoulder = (
            (coords[11][0] + coords[12][0]) / 2,
            (coords[11][1] + coords[12][1]) / 2,
        )
        mid_hip = (
            (coords[23][0] + coords[24][0]) / 2,
            (coords[23][1] + coords[24][1]) / 2,
        )

        # Angle at mid-shoulder between nose - shoulder - hip
        spine_angle = calculate_angle(nose, mid_shoulder, mid_hip)

        # Ideal = 180° (straight line). Deviation = |180 - angle|
        deviation = abs(180.0 - spine_angle)
        is_upright = deviation < 25.0
        score = clamp(1.0 - (deviation / self.SPINE_DEVIATION_MAX_DEG))

        return {
            "spine_angle_deg": round(deviation, 2),
            "is_upright": is_upright,
            "score": round(score, 4),
        }

    def _detect_nervous_gestures(
        self,
        pose_coords: np.ndarray,
        visibilities: list,
        hand_landmarks_list: list,
        frame_w: int,
        frame_h: int,
    ) -> Dict[str, Any]:
        """
        Detect face-touching and fidgeting behaviors.

        Face-touching: wrist landmarks (15, 16) proximity to nose (0).
        Fidgeting: variance of wrist positions over temporal window.
        """
        nose = (pose_coords[0][0], pose_coords[0][1])
        left_wrist = (pose_coords[15][0], pose_coords[15][1])
        right_wrist = (pose_coords[16][0], pose_coords[16][1])

        # ── Face-touching detection (sustained-contact debounce) ──
        # Check distance from nose to wrists AND index fingers (pose landmarks 19, 20)
        left_index = (pose_coords[19][0], pose_coords[19][1])
        right_index = (pose_coords[20][0], pose_coords[20][1])

        distances = [
            euclidean_distance(left_wrist, nose),
            euclidean_distance(right_wrist, nose),
            euclidean_distance(left_index, nose),
            euclidean_distance(right_index, nose),
        ]

        # Require reasonable visibility on the nose to avoid false positives
        proximity_detected = False
        if visibilities[0] > 0.4:
            proximity_detected = any(d < self.FACE_TOUCH_DISTANCE_THRESHOLD for d in distances)

        # Sustained-contact debounce: only count a "touch" after
        # FACE_TOUCH_SUSTAIN_FRAMES consecutive frames of proximity (~1.5s at 12 FPS)
        if proximity_detected:
            self._consecutive_touch_frames += 1
        else:
            self._consecutive_touch_frames = 0

        is_touching = self._consecutive_touch_frames >= self.FACE_TOUCH_SUSTAIN_FRAMES

        # Increment confirmed count only on the transition frame
        if is_touching and self._consecutive_touch_frames == self.FACE_TOUCH_SUSTAIN_FRAMES:
            self._confirmed_touch_count += 1

        self._face_touch_history.append(1 if is_touching else 0)

        # ── Fidgeting detection ──
        self._wrist_history.append(
            (left_wrist[0], left_wrist[1], right_wrist[0], right_wrist[1])
        )

        fidgeting_score = 0.0
        if len(self._wrist_history) >= 5:
            wrist_array = np.array(list(self._wrist_history))
            variance = np.var(wrist_array, axis=0).mean()
            fidgeting_score = min(1.0, variance / self.FIDGET_VARIANCE_THRESHOLD)

        # ── Combined gesture score ──
        face_touch_penalty = min(1.0, self._confirmed_touch_count * 0.15)
        fidget_penalty = fidgeting_score * 0.5
        gesture_score = clamp(1.0 - face_touch_penalty - fidget_penalty)

        return {
            "face_touch_count": self._confirmed_touch_count,
            "is_touching_face": is_touching,
            "fidgeting_score": round(fidgeting_score, 4),
            "score": round(gesture_score, 4),
        }

    def reset(self):
        """Reset temporal buffers (call between interview sessions)."""
        self._wrist_history.clear()
        self._face_touch_history.clear()
        self._consecutive_touch_frames = 0
        self._confirmed_touch_count = 0
        self._pose_smoother.reset()

    def close(self):
        """Release MediaPipe resources."""
        self.pose.close()
        self.hands.close()
