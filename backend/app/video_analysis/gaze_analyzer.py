"""
Gaze Analyzer — Pupil tracking, gaze direction detection,
and head pose estimation.

Uses MediaPipe Tasks API — FaceLandmarker with iris refinement
(478 landmarks) and OpenCV's solvePnP for 3D head pose from
2D facial landmarks.
"""

import math
import os
from collections import deque
from typing import Dict, Any, Tuple, Optional

import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks.python import BaseOptions
from mediapipe.tasks.python.vision import (
    FaceLandmarker,
    FaceLandmarkerOptions,
    RunningMode,
)

from app.video_analysis.utils import clamp, LandmarkSmoother


# ── Model path ───────────────────────────────────────────────────────

_MODELS_DIR = os.path.join(os.path.dirname(__file__), "models")
_FACE_MODEL = os.path.join(_MODELS_DIR, "face_landmarker.task")


# ── 3D generic face model for solvePnP ───────────────────────────────
# Approximate 3D coordinates of key facial features
# in a canonical face coordinate system.

MODEL_POINTS_3D = np.array(
    [
        (0.0, 0.0, 0.0),         # Nose tip
        (0.0, -330.0, -65.0),    # Chin
        (-225.0, 170.0, -135.0), # Left eye left corner
        (225.0, 170.0, -135.0),  # Right eye right corner
        (-150.0, -150.0, -125.0),# Left mouth corner
        (150.0, -150.0, -125.0), # Right mouth corner
    ],
    dtype=np.float64,
)

# Corresponding Face Mesh landmark indices for the 3D model points
FACE_MESH_INDICES = [1, 199, 33, 263, 61, 291]

# ── Eye landmark indices for pupil ratio calculation ─────────────────

LEFT_EYE_OUTER = 33
LEFT_EYE_INNER = 133
LEFT_EYE_TOP = 159
LEFT_EYE_BOTTOM = 145
LEFT_IRIS_CENTER = 468

RIGHT_EYE_OUTER = 362
RIGHT_EYE_INNER = 263
RIGHT_EYE_TOP = 386
RIGHT_EYE_BOTTOM = 374
RIGHT_IRIS_CENTER = 473

# ── Head pose thresholds ─────────────────────────────────────────────

YAW_THRESHOLD = 25.0    # degrees — beyond this, not facing screen
PITCH_THRESHOLD = 20.0  # degrees — beyond this, looking too far up/down

# ── Gaze direction thresholds ────────────────────────────────────────

GAZE_CENTER_LOW = 0.35
GAZE_CENTER_HIGH = 0.65


class GazeAnalyzer:
    """
    Tracks pupil position, estimates gaze direction, and computes
    3D head pose to measure visual engagement during an interview.

    Features:
        - Iris/pupil position tracking (left and right eyes)
        - Gaze direction classification (center, left, right, up, down)
        - 3D head pose estimation (pitch, yaw, roll) via solvePnP
        - Engagement score combining gaze + head orientation
    """

    ENGAGEMENT_WINDOW_SIZE = 30  # frames for temporal averaging

    def __init__(self):
        """Initialize MediaPipe FaceLandmarker with iris refinement."""
        face_options = FaceLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=_FACE_MODEL),
            running_mode=RunningMode.IMAGE,
            num_faces=1,
            min_face_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            output_face_blendshapes=False,
            output_facial_transformation_matrixes=False,
        )
        self.face_mesh = FaceLandmarker.create_from_options(face_options)

        # Temporal buffer for engagement averaging
        self._engagement_history: deque = deque(
            maxlen=self.ENGAGEMENT_WINDOW_SIZE
        )

        self._smoother = LandmarkSmoother(alpha=0.35)

    def analyze_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Run full gaze analysis on a single frame.

        Args:
            frame: OpenCV BGR image.

        Returns:
            Dictionary with head pose, pupil data, gaze direction,
            and engagement score.
        """
        rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        h, w, _ = frame.shape

        # Convert to MediaPipe Image
        mp_image = mp.Image(
            image_format=mp.ImageFormat.SRGB, data=rgb_frame
        )

        results = self.face_mesh.detect(mp_image)

        output = {
            "face_detected": False,
            "head_pose": None,
            "gaze": None,
            "engagement_score": 0.0,
        }

        if not results.face_landmarks or len(results.face_landmarks) == 0:
            self._engagement_history.append(0.0)
            return output

        face_landmarks = results.face_landmarks[0]  # First face
        output["face_detected"] = True

        # ── Head Pose Estimation ──
        head_pose = self._estimate_head_pose(face_landmarks, w, h)
        output["head_pose"] = head_pose

        # ── Pupil Tracking + Gaze Direction ──
        gaze_data = self._track_pupils(face_landmarks, w, h)
        output["gaze"] = gaze_data

        # ── Engagement Score ──
        engagement = self._calculate_engagement(head_pose, gaze_data)
        self._engagement_history.append(engagement)

        # Temporal average for stability
        avg_engagement = (
            sum(self._engagement_history) / len(self._engagement_history)
        )
        output["engagement_score"] = round(avg_engagement, 4)

        return output

    def _estimate_head_pose(
        self, landmarks, frame_w: int, frame_h: int
    ) -> Dict[str, Any]:
        """
        Estimate 3D head pose using solvePnP.

        Maps 2D face landmark pixel coordinates to a generic 3D
        face model to compute rotation vector, then extracts
        Euler angles (pitch, yaw, roll).
        """
        # Extract 2D image points for the 6 key landmarks
        image_points = np.array(
            [
                (landmarks[idx].x * frame_w, landmarks[idx].y * frame_h)
                for idx in FACE_MESH_INDICES
            ],
            dtype=np.float64,
        )

        # Camera intrinsics estimation
        focal_length = frame_w
        center = (frame_w / 2.0, frame_h / 2.0)
        camera_matrix = np.array(
            [
                [focal_length, 0, center[0]],
                [0, focal_length, center[1]],
                [0, 0, 1],
            ],
            dtype=np.float64,
        )
        dist_coeffs = np.zeros((4, 1))

        # Solve PnP
        success, rotation_vec, translation_vec = cv2.solvePnP(
            MODEL_POINTS_3D,
            image_points,
            camera_matrix,
            dist_coeffs,
            flags=cv2.SOLVEPNP_ITERATIVE,
        )

        if not success:
            return {
                "pitch": 0.0, "yaw": 0.0, "roll": 0.0,
                "looking_at_screen": True,
            }

        # Convert rotation vector to rotation matrix, then to Euler angles
        rotation_mat, _ = cv2.Rodrigues(rotation_vec)

        # Extract Euler angles directly from the rotation matrix
        # Using the standard ZYX convention
        sy = math.sqrt(
            rotation_mat[0, 0] ** 2 + rotation_mat[1, 0] ** 2
        )
        singular = sy < 1e-6

        if not singular:
            pitch = math.degrees(
                math.atan2(rotation_mat[2, 1], rotation_mat[2, 2])
            )
            yaw = math.degrees(
                math.atan2(-rotation_mat[2, 0], sy)
            )
            roll = math.degrees(
                math.atan2(rotation_mat[1, 0], rotation_mat[0, 0])
            )
        else:
            pitch = math.degrees(
                math.atan2(-rotation_mat[1, 2], rotation_mat[1, 1])
            )
            yaw = math.degrees(
                math.atan2(-rotation_mat[2, 0], sy)
            )
            roll = 0.0

        # Clamp extreme values
        pitch = max(-90, min(90, pitch))
        yaw = max(-90, min(90, yaw))
        roll = max(-90, min(90, roll))

        looking_at_screen = (
            abs(yaw) < YAW_THRESHOLD and abs(pitch) < PITCH_THRESHOLD
        )

        return {
            "pitch": round(pitch, 2),
            "yaw": round(yaw, 2),
            "roll": round(roll, 2),
            "looking_at_screen": looking_at_screen,
        }

    def _track_pupils(
        self, landmarks, frame_w: int, frame_h: int
    ) -> Dict[str, Any]:
        """
        Track pupil positions within their eye sockets.

        Computes the iris center position as a ratio within the
        eye bounding box. A ratio near (0.5, 0.5) = looking straight
        at the camera.
        """
        def _get_pupil_ratio(
            iris_idx: int,
            eye_outer_idx: int,
            eye_inner_idx: int,
            eye_top_idx: int,
            eye_bottom_idx: int,
        ) -> Tuple[float, float]:
            """Calculate normalized pupil position within the eye."""
            iris = landmarks[iris_idx]
            outer = landmarks[eye_outer_idx]
            inner = landmarks[eye_inner_idx]
            top = landmarks[eye_top_idx]
            bottom = landmarks[eye_bottom_idx]

            # Horizontal ratio
            eye_width = abs(inner.x - outer.x)
            if eye_width < 1e-6:
                h_ratio = 0.5
            else:
                h_ratio = (iris.x - min(outer.x, inner.x)) / eye_width

            # Vertical ratio
            eye_height = abs(bottom.y - top.y)
            if eye_height < 1e-6:
                v_ratio = 0.5
            else:
                v_ratio = (iris.y - top.y) / eye_height

            return (clamp(h_ratio), clamp(v_ratio))

        # Check if iris landmarks are available (indices 468+)
        if len(landmarks) < 478:
            return {
                "left_pupil_ratio": [0.5, 0.5],
                "right_pupil_ratio": [0.5, 0.5],
                "direction": "center",
            }

        left_ratio = _get_pupil_ratio(
            LEFT_IRIS_CENTER,
            LEFT_EYE_OUTER, LEFT_EYE_INNER,
            LEFT_EYE_TOP, LEFT_EYE_BOTTOM,
        )
        right_ratio = _get_pupil_ratio(
            RIGHT_IRIS_CENTER,
            RIGHT_EYE_OUTER, RIGHT_EYE_INNER,
            RIGHT_EYE_TOP, RIGHT_EYE_BOTTOM,
        )

        # Average both eyes for direction classification
        avg_x = (left_ratio[0] + right_ratio[0]) / 2
        avg_y = (left_ratio[1] + right_ratio[1]) / 2

        direction = self._classify_gaze_direction(avg_x, avg_y)

        return {
            "left_pupil_ratio": [round(left_ratio[0], 4), round(left_ratio[1], 4)],
            "right_pupil_ratio": [round(right_ratio[0], 4), round(right_ratio[1], 4)],
            "direction": direction,
        }

    @staticmethod
    def _classify_gaze_direction(avg_x: float, avg_y: float) -> str:
        """
        Classify gaze direction based on average pupil ratios.

        Returns one of: center, left, right, up, down.
        """
        if avg_x < GAZE_CENTER_LOW:
            return "right"   # Camera-perspective right
        elif avg_x > GAZE_CENTER_HIGH:
            return "left"    # Camera-perspective left
        elif avg_y < GAZE_CENTER_LOW:
            return "up"
        elif avg_y > GAZE_CENTER_HIGH:
            return "down"
        else:
            return "center"

    @staticmethod
    def _calculate_engagement(
        head_pose: Dict[str, Any], gaze_data: Dict[str, Any]
    ) -> float:
        """
        Calculate instantaneous engagement score from head pose
        and gaze data.

        Components:
        - Gaze centering (40%): How centered the pupils are
        - Head yaw (30%): How much the head is turned away
        - Head pitch (30%): How much the head is tilted up/down
        """
        # Gaze centering score
        left = gaze_data.get("left_pupil_ratio", [0.5, 0.5])
        right = gaze_data.get("right_pupil_ratio", [0.5, 0.5])
        avg_x = (left[0] + right[0]) / 2
        avg_y = (left[1] + right[1]) / 2

        gaze_deviation = math.sqrt((avg_x - 0.5) ** 2 + (avg_y - 0.5) ** 2)
        gaze_score = clamp(1.0 - (gaze_deviation / 0.5))

        # Head yaw score
        yaw = abs(head_pose.get("yaw", 0.0))
        yaw_score = clamp(1.0 - (yaw / YAW_THRESHOLD))

        # Head pitch score
        pitch = abs(head_pose.get("pitch", 0.0))
        pitch_score = clamp(1.0 - (pitch / PITCH_THRESHOLD))

        engagement = (
            0.40 * gaze_score
            + 0.30 * yaw_score
            + 0.30 * pitch_score
        )

        return clamp(engagement)

    def reset(self):
        """Reset temporal buffers."""
        self._engagement_history.clear()
        self._smoother.reset()

    def close(self):
        """Release MediaPipe resources."""
        self.face_mesh.close()
