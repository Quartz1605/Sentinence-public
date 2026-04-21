"""
Face Analyzer — Facial expression classification and emotion detection.

Uses DeepFace to classify the candidate's facial expression into
one of 7 primary emotional states and provides a confidence modifier
for the overall behavioral score.
"""

import logging
from typing import Dict, Any, Optional

import cv2
import numpy as np

logger = logging.getLogger(__name__)


# Emotion → confidence modifier mapping
# Positive emotions boost the candidate's confidence score;
# negative emotions penalize it.
EMOTION_MODIFIERS: Dict[str, float] = {
    "happy": 0.10,
    "neutral": 0.00,
    "surprise": -0.05,
    "sad": -0.10,
    "angry": -0.10,
    "fear": -0.15,
    "disgust": -0.15,
}


class FaceAnalyzer:
    """
    Classifies facial expressions using DeepFace.

    Detects 7 primary emotions: happy, sad, angry, surprise,
    fear, disgust, and neutral. Provides probability distribution
    across all emotions and a confidence modifier for scoring.
    """

    def __init__(self):
        """
        Initialize the FaceAnalyzer.

        DeepFace loads its model on the first call to analyze(),
        so initialization is lightweight.
        """
        self._deepface = None
        self._model_loaded = False

    def _ensure_model(self):
        """Lazy-load DeepFace to avoid slow startup."""
        if self._deepface is None:
            try:
                from deepface import DeepFace
                self._deepface = DeepFace
                self._model_loaded = True
                logger.info("DeepFace loaded successfully")
            except ImportError:
                logger.error(
                    "DeepFace not installed. Run: pip install deepface"
                )
                raise

    def analyze_frame(self, frame: np.ndarray) -> Dict[str, Any]:
        """
        Classify the facial expression in a single frame.

        Args:
            frame: OpenCV BGR image.

        Returns:
            Dictionary with dominant emotion, emotion probability
            distribution, face region, and confidence modifier.
        """
        self._ensure_model()

        result = {
            "face_detected": False,
            "dominant_emotion": "neutral",
            "emotion_scores": {},
            "confidence_modifier": 0.0,
            "face_region": None,
        }

        try:
            analysis = self._deepface.analyze(
                frame,
                actions=["emotion"],
                enforce_detection=False,
                silent=True,
            )

            # DeepFace returns a list of results (one per detected face)
            if isinstance(analysis, list) and len(analysis) > 0:
                face_data = analysis[0]
            elif isinstance(analysis, dict):
                face_data = analysis
            else:
                return result

            dominant = face_data.get("dominant_emotion", "neutral")
            emotions = face_data.get("emotion", {})
            region = face_data.get("region", {})

            # Normalize emotion scores to [0, 1]
            total = sum(emotions.values()) if emotions else 1.0
            normalized_emotions = {
                k: round(v / total, 4)
                for k, v in emotions.items()
            } if total > 0 else emotions

            result["face_detected"] = True
            result["dominant_emotion"] = dominant
            result["emotion_scores"] = normalized_emotions
            result["confidence_modifier"] = EMOTION_MODIFIERS.get(
                dominant, 0.0
            )
            result["face_region"] = {
                "x": region.get("x", 0),
                "y": region.get("y", 0),
                "w": region.get("w", 0),
                "h": region.get("h", 0),
            }

        except Exception as e:
            logger.warning(f"Face analysis failed: {e}")

        return result

    @staticmethod
    def get_emotion_confidence_modifier(emotion: str) -> float:
        """
        Get the confidence score modifier for a given emotion.

        Args:
            emotion: One of the 7 primary emotions.

        Returns:
            Float modifier to add to the confidence score.
        """
        return EMOTION_MODIFIERS.get(emotion.lower(), 0.0)

    @property
    def is_loaded(self) -> bool:
        """Check if the DeepFace model has been loaded."""
        return self._model_loaded
