"""
Shared utility functions for the video analysis pipeline.

Provides frame decoding, angle calculation, distance math,
and landmark smoothing used by all analyzers.
"""

import base64
import math
from collections import deque
from typing import Tuple, List, Optional

import cv2
import numpy as np


def decode_base64_frame(data: str) -> np.ndarray:
    """
    Decode a base64-encoded image string into an OpenCV BGR frame.

    Accepts both raw base64 and data-URI formatted strings
    (e.g., "data:image/jpeg;base64,/9j/4AAQ...").

    Args:
        data: Base64-encoded image string.

    Returns:
        OpenCV BGR image as a numpy array.

    Raises:
        ValueError: If the image cannot be decoded.
    """
    # Strip data-URI prefix if present
    if "," in data:
        data = data.split(",", 1)[1]

    img_bytes = base64.b64decode(data)
    img_array = np.frombuffer(img_bytes, dtype=np.uint8)
    frame = cv2.imdecode(img_array, cv2.IMREAD_COLOR)

    if frame is None:
        raise ValueError("Failed to decode base64 image data")

    return frame


def calculate_angle(
    a: Tuple[float, float],
    b: Tuple[float, float],
    c: Tuple[float, float],
) -> float:
    """
    Calculate the angle at point B formed by points A-B-C.

    Uses the atan2 method for numerical stability.

    Args:
        a: (x, y) coordinates of point A.
        b: (x, y) coordinates of the vertex point B.
        c: (x, y) coordinates of point C.

    Returns:
        Angle in degrees at point B, range [0, 360).
    """
    ba = (a[0] - b[0], a[1] - b[1])
    bc = (c[0] - b[0], c[1] - b[1])

    dot_product = ba[0] * bc[0] + ba[1] * bc[1]
    cross_product = ba[0] * bc[1] - ba[1] * bc[0]

    angle_rad = math.atan2(abs(cross_product), dot_product)
    return math.degrees(angle_rad)


def euclidean_distance(
    p1: Tuple[float, float], p2: Tuple[float, float]
) -> float:
    """
    Compute Euclidean distance between two 2D points.

    Args:
        p1: (x, y) of point 1.
        p2: (x, y) of point 2.

    Returns:
        Euclidean distance as a float.
    """
    return math.sqrt((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2)


def euclidean_distance_3d(
    p1: Tuple[float, float, float], p2: Tuple[float, float, float]
) -> float:
    """
    Compute Euclidean distance between two 3D points.

    Args:
        p1: (x, y, z) of point 1.
        p2: (x, y, z) of point 2.

    Returns:
        Euclidean distance as a float.
    """
    return math.sqrt(
        (p1[0] - p2[0]) ** 2
        + (p1[1] - p2[1]) ** 2
        + (p1[2] - p2[2]) ** 2
    )


class LandmarkSmoother:
    """
    Exponential Moving Average (EMA) smoother for landmark coordinates.

    Reduces jitter in frame-by-frame landmark detection by applying
    a weighted blend between the previous smoothed value and the
    new observation.
    """

    def __init__(self, alpha: float = 0.3):
        """
        Args:
            alpha: Smoothing factor in [0, 1]. Higher = more responsive
                   to new data, lower = smoother but more latent.
        """
        self.alpha = alpha
        self._prev: Optional[np.ndarray] = None

    def smooth(self, landmarks: np.ndarray) -> np.ndarray:
        """
        Apply EMA smoothing to a new set of landmark coordinates.

        Args:
            landmarks: Array of shape (N, 2) or (N, 3) with landmark coords.

        Returns:
            Smoothed landmark array of the same shape.
        """
        if self._prev is None or self._prev.shape != landmarks.shape:
            self._prev = landmarks.copy()
            return landmarks

        smoothed = self.alpha * landmarks + (1 - self.alpha) * self._prev
        self._prev = smoothed.copy()
        return smoothed

    def reset(self):
        """Reset smoother state (e.g., when switching to a new video)."""
        self._prev = None


def clamp(value: float, min_val: float = 0.0, max_val: float = 1.0) -> float:
    """Clamp a value between min_val and max_val."""
    return max(min_val, min(max_val, value))
