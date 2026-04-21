"""
Confidence Scorer — Aggregation engine for video analysis scores.

Combines sub-scores from the PoseAnalyzer, FaceAnalyzer, and
GazeAnalyzer into unified confidence and engagement metrics.
These scores are designed to be fused with audio and text module
scores downstream for a final composite interview score.
"""

from typing import Dict, Any, Optional

from app.video_analysis.utils import clamp


class ConfidenceScorer:
    """
    Aggregates individual analyzer outputs into final video scores.

    Produces:
        - confidence_score (0.0-1.0): Physical composure + emotion
        - engagement_score (0.0-1.0): Visual attention / eye contact
        - dominant_emotion: Primary facial expression
        - details: Full breakdown of all sub-scores
    """

    def compute_video_scores(
        self,
        pose_result: Dict[str, Any],
        face_result: Dict[str, Any],
        gaze_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        Compute final video analysis scores from individual analyzer outputs.

        Args:
            pose_result: Output from PoseAnalyzer.analyze_frame()
            face_result: Output from FaceAnalyzer.analyze_frame()
            gaze_result: Output from GazeAnalyzer.analyze_frame()

        Returns:
            Complete score breakdown with confidence, engagement,
            emotion, and detailed sub-scores.
        """
        # ── Extract sub-scores ──
        body_confidence = pose_result.get("body_confidence", 0.5)
        emotion_modifier = face_result.get("confidence_modifier", 0.0)
        engagement_score = gaze_result.get("engagement_score", 0.5)

        # ── Compute final confidence ──
        # Body confidence adjusted by emotional state
        confidence_score = clamp(body_confidence + emotion_modifier)

        # ── Assemble details ──
        details = {}

        # Shoulder alignment details
        shoulder = pose_result.get("shoulder_alignment")
        if shoulder:
            details["shoulder_alignment"] = {
                "angle_deg": shoulder.get("angle_deg", 0.0),
                "is_aligned": shoulder.get("is_aligned", True),
                "score": shoulder.get("score", 0.5),
            }

        # Posture details
        posture = pose_result.get("posture")
        if posture:
            details["posture"] = {
                "spine_angle_deg": posture.get("spine_angle_deg", 0.0),
                "is_upright": posture.get("is_upright", True),
                "score": posture.get("score", 0.5),
            }

        # Nervous gesture details
        gestures = pose_result.get("nervous_gestures")
        if gestures:
            details["nervous_gestures"] = {
                "face_touch_count": gestures.get("face_touch_count", 0),
                "is_touching_face": gestures.get("is_touching_face", False),
                "fidgeting_score": gestures.get("fidgeting_score", 0.0),
                "score": gestures.get("score", 0.5),
            }

        # Head pose details
        head_pose = gaze_result.get("head_pose")
        if head_pose:
            details["head_pose"] = {
                "pitch": head_pose.get("pitch", 0.0),
                "yaw": head_pose.get("yaw", 0.0),
                "roll": head_pose.get("roll", 0.0),
                "looking_at_screen": head_pose.get("looking_at_screen", True),
            }

        # Gaze details
        gaze = gaze_result.get("gaze")
        if gaze:
            details["gaze"] = {
                "left_pupil_ratio": gaze.get("left_pupil_ratio", [0.5, 0.5]),
                "right_pupil_ratio": gaze.get("right_pupil_ratio", [0.5, 0.5]),
                "direction": gaze.get("direction", "center"),
            }

        # Emotion breakdown
        details["emotion_breakdown"] = face_result.get("emotion_scores", {})

        return {
            "confidence_score": round(confidence_score, 4),
            "engagement_score": round(engagement_score, 4),
            "dominant_emotion": face_result.get("dominant_emotion", "neutral"),
            "pose_detected": pose_result.get("pose_detected", False),
            "face_detected": face_result.get("face_detected", False)
                             or gaze_result.get("face_detected", False),
            "details": details,
        }

    @staticmethod
    def compute_batch_summary(
        frame_results: list,
    ) -> Dict[str, Any]:
        """
        Compute aggregate statistics over multiple frame results.

        Args:
            frame_results: List of per-frame score dictionaries
                           (output of compute_video_scores).

        Returns:
            Summary with averages, min/max, and per-frame data.
        """
        if not frame_results:
            return {
                "avg_confidence_score": 0.0,
                "avg_engagement_score": 0.0,
                "min_confidence_score": 0.0,
                "max_confidence_score": 0.0,
                "min_engagement_score": 0.0,
                "max_engagement_score": 0.0,
                "dominant_emotion_distribution": {},
                "frame_count": 0,
                "frames": [],
            }

        confidence_scores = [
            r["confidence_score"] for r in frame_results
        ]
        engagement_scores = [
            r["engagement_score"] for r in frame_results
        ]

        # Count dominant emotion occurrences
        emotion_counts: Dict[str, int] = {}
        for r in frame_results:
            emotion = r.get("dominant_emotion", "neutral")
            emotion_counts[emotion] = emotion_counts.get(emotion, 0) + 1

        total_frames = len(frame_results)
        emotion_distribution = {
            k: round(v / total_frames, 4)
            for k, v in emotion_counts.items()
        }

        return {
            "avg_confidence_score": round(
                sum(confidence_scores) / total_frames, 4
            ),
            "avg_engagement_score": round(
                sum(engagement_scores) / total_frames, 4
            ),
            "min_confidence_score": round(min(confidence_scores), 4),
            "max_confidence_score": round(max(confidence_scores), 4),
            "min_engagement_score": round(min(engagement_scores), 4),
            "max_engagement_score": round(max(engagement_scores), 4),
            "dominant_emotion_distribution": emotion_distribution,
            "frame_count": total_frames,
            "frames": frame_results,
        }
