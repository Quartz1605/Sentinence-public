"""
Metrics aggregator for meeting room sessions.

Receives raw video/voice scores from the frontend, applies exponential
moving average smoothing, and returns clean composite scores.
"""

import math


def _bounded(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def smooth(prev: float, new: float, alpha: float = 0.3) -> float:
    """Exponential moving average. alpha=1 means no smoothing."""
    return alpha * new + (1 - alpha) * prev


class MetricsAggregator:
    """
    Stateful aggregator that tracks running averages.
    One instance per meeting session.
    """

    def __init__(self) -> None:
        self._confidence: float = 70.0
        self._helpfulness: float = 72.0
        self._engagement: float = 74.0
        self._alpha: float = 0.3
        self._elapsed_sec: int = 0

    def update(
        self,
        *,
        elapsed_sec: int = 0,
        video_confidence: float | None = None,
        video_engagement: float | None = None,
        voice_confidence: float | None = None,
        voice_stress: str | None = None,
        candidate_message_count: int = 0,
        interruptions: int = 0,
    ) -> dict:
        """
        Accept raw signals and return smoothed composite scores.

        Parameters
        ----------
        video_confidence : float 0-100, from /video/analyze-frame
        video_engagement : float 0-100, from /video/analyze-frame
        voice_confidence : float 0-1, from /voice/stream periodic insight
        voice_stress : str "high"|"medium"|"low"
        candidate_message_count : int, total messages sent by candidate so far
        interruptions : int, total interruptions so far
        """
        self._elapsed_sec = elapsed_sec

        # Confidence: blend video + voice when available
        if video_confidence is not None:
            self._confidence = smooth(self._confidence, video_confidence, self._alpha)

        if voice_confidence is not None:
            voice_pct = voice_confidence * 100.0
            self._confidence = smooth(self._confidence, voice_pct, self._alpha * 0.5)

        # Stress penalty
        if voice_stress == "high":
            self._confidence = smooth(self._confidence, self._confidence - 5, 0.2)

        # Engagement: primarily video, boosted by message activity
        if video_engagement is not None:
            self._engagement = smooth(self._engagement, video_engagement, self._alpha)

        # More messages = more engaged (gentle upward pressure)
        if candidate_message_count > 0:
            msg_boost = min(candidate_message_count * 1.5, 10)
            self._engagement = smooth(self._engagement, self._engagement + msg_boost, 0.1)

        # Helpfulness: driven by message quality proxy (length/frequency)
        if candidate_message_count > 0:
            help_base = 65 + min(candidate_message_count * 3, 30)
            self._helpfulness = smooth(self._helpfulness, help_base, self._alpha * 0.4)

        # Interruption penalty across all scores
        if interruptions > 3:
            penalty = min((interruptions - 3) * 2, 15)
            self._confidence = _bounded(self._confidence - penalty * 0.05)
            self._engagement = _bounded(self._engagement - penalty * 0.03)

        return self.snapshot()

    def snapshot(self) -> dict:
        return {
            "elapsed_sec": self._elapsed_sec,
            "confidence": round(_bounded(self._confidence), 1),
            "helpfulness": round(_bounded(self._helpfulness), 1),
            "engagement": round(_bounded(self._engagement), 1),
        }
