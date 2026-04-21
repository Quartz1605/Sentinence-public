"""
Pydantic schemas for the video analysis API endpoints.

Defines request and response models for single-frame and
batch frame analysis.
"""

from typing import Dict, List, Optional, Any

from pydantic import BaseModel, Field


# ── Request Models ───────────────────────────────────────────────────


class FrameAnalysisRequest(BaseModel):
    """Request payload for single-frame analysis."""

    frame: str = Field(
        ...,
        description=(
            "Base64-encoded image string. Accepts raw base64 or "
            "data-URI format (e.g., 'data:image/jpeg;base64,...')."
        ),
    )


class BatchAnalysisRequest(BaseModel):
    """Request payload for batch (multi-frame) analysis."""

    frames: List[str] = Field(
        ...,
        min_length=1,
        max_length=120,
        description=(
            "List of base64-encoded image strings. "
            "Max 120 frames per batch (≈ 4 seconds at 30fps)."
        ),
    )


# ── Detail Sub-Models ────────────────────────────────────────────────


class ShoulderAlignmentDetail(BaseModel):
    """Detail model for shoulder alignment analysis."""
    angle_deg: float = Field(description="Tilt angle in degrees")
    is_aligned: bool = Field(description="True if shoulders are level (< 10°)")
    score: float = Field(description="Alignment score [0.0, 1.0]")


class PostureDetail(BaseModel):
    """Detail model for posture/spine analysis."""
    spine_angle_deg: float = Field(description="Deviation from upright in degrees")
    is_upright: bool = Field(description="True if posture is upright (< 15°)")
    score: float = Field(description="Posture score [0.0, 1.0]")


class NervousGestureDetail(BaseModel):
    """Detail model for nervous gesture detection."""
    face_touch_count: int = Field(description="Number of face touches in temporal window")
    is_touching_face: bool = Field(description="Currently touching face")
    fidgeting_score: float = Field(description="Fidgeting intensity [0.0, 1.0]")
    score: float = Field(description="Gesture calmness score [0.0, 1.0]")


class HeadPoseDetail(BaseModel):
    """Detail model for head pose estimation."""
    pitch: float = Field(description="Head pitch in degrees (nodding)")
    yaw: float = Field(description="Head yaw in degrees (turning)")
    roll: float = Field(description="Head roll in degrees (tilting)")
    looking_at_screen: bool = Field(description="True if facing the screen")


class GazeDetail(BaseModel):
    """Detail model for gaze/pupil tracking."""
    left_pupil_ratio: List[float] = Field(description="[x, y] ratio within left eye")
    right_pupil_ratio: List[float] = Field(description="[x, y] ratio within right eye")
    direction: str = Field(description="Gaze direction: center, left, right, up, down")


class AnalysisDetails(BaseModel):
    """Full breakdown of all analysis sub-scores."""
    shoulder_alignment: Optional[ShoulderAlignmentDetail] = None
    posture: Optional[PostureDetail] = None
    nervous_gestures: Optional[NervousGestureDetail] = None
    head_pose: Optional[HeadPoseDetail] = None
    gaze: Optional[GazeDetail] = None
    emotion_breakdown: Dict[str, float] = Field(
        default_factory=dict,
        description="Probability distribution across 7 emotions",
    )


# ── Response Models ──────────────────────────────────────────────────


class FrameAnalysisResponse(BaseModel):
    """Response for single-frame analysis."""

    confidence_score: float = Field(
        description="Overall confidence score [0.0, 1.0]"
    )
    engagement_score: float = Field(
        description="Visual engagement score [0.0, 1.0]"
    )
    dominant_emotion: str = Field(
        description="Primary detected emotion"
    )
    pose_detected: bool = Field(
        description="Whether a body pose was detected in the frame"
    )
    face_detected: bool = Field(
        description="Whether a face was detected in the frame"
    )
    details: AnalysisDetails = Field(
        description="Full breakdown of all sub-scores"
    )


class BatchAnalysisResponse(BaseModel):
    """Response for batch (multi-frame) analysis."""

    avg_confidence_score: float = Field(
        description="Average confidence score across all frames"
    )
    avg_engagement_score: float = Field(
        description="Average engagement score across all frames"
    )
    min_confidence_score: float
    max_confidence_score: float
    min_engagement_score: float
    max_engagement_score: float
    dominant_emotion_distribution: Dict[str, float] = Field(
        description="Proportion of each emotion across all frames"
    )
    frame_count: int = Field(description="Number of frames analyzed")
    frames: List[FrameAnalysisResponse] = Field(
        description="Per-frame analysis results"
    )


class HealthResponse(BaseModel):
    """Response for the health check endpoint."""

    status: str
    mediapipe_loaded: bool
    deepface_loaded: bool
