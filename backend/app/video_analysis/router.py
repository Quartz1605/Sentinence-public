"""
Video Analysis Router — FastAPI endpoints for real-time
behavioral intelligence from video frames.

Endpoints:
    POST /video/analyze-frame  — Analyze a single base64-encoded frame
    POST /video/analyze-batch  — Analyze multiple frames with aggregation
    GET  /video/health         — Health check for loaded models
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, HTTPException

from app.video_analysis.schemas import (
    FrameAnalysisRequest,
    FrameAnalysisResponse,
    BatchAnalysisRequest,
    BatchAnalysisResponse,
    HealthResponse,
)
from app.video_analysis.utils import decode_base64_frame
from app.video_analysis.pose_analyzer import PoseAnalyzer
from app.video_analysis.face_analyzer import FaceAnalyzer
from app.video_analysis.gaze_analyzer import GazeAnalyzer
from app.video_analysis.confidence_scorer import ConfidenceScorer

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/video", tags=["Video Analysis"])

# ── Singleton analyzer instances ─────────────────────────────────────
# Initialized lazily on first request to avoid slow startup.

_pose_analyzer: Optional[PoseAnalyzer] = None
_face_analyzer: Optional[FaceAnalyzer] = None
_gaze_analyzer: Optional[GazeAnalyzer] = None
_confidence_scorer: Optional[ConfidenceScorer] = None


def _get_analyzers():
    """Lazy-initialize all analyzer singletons."""
    global _pose_analyzer, _face_analyzer, _gaze_analyzer, _confidence_scorer

    if _pose_analyzer is None:
        logger.info("Initializing PoseAnalyzer...")
        _pose_analyzer = PoseAnalyzer()

    if _face_analyzer is None:
        logger.info("Initializing FaceAnalyzer...")
        _face_analyzer = FaceAnalyzer()

    if _gaze_analyzer is None:
        logger.info("Initializing GazeAnalyzer...")
        _gaze_analyzer = GazeAnalyzer()

    if _confidence_scorer is None:
        _confidence_scorer = ConfidenceScorer()

    return _pose_analyzer, _face_analyzer, _gaze_analyzer, _confidence_scorer


def _analyze_single_frame(frame_b64: str) -> dict:
    """
    Core analysis logic for a single base64-encoded frame.

    Runs all three analyzers and aggregates scores.
    Returns the raw dict (not Pydantic model) for flexibility.
    """
    pose, face, gaze, scorer = _get_analyzers()

    # Decode frame
    try:
        frame = decode_base64_frame(frame_b64)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Run analyzers
    pose_result = pose.analyze_frame(frame)
    face_result = face.analyze_frame(frame)
    gaze_result = gaze.analyze_frame(frame)

    # Aggregate scores
    return scorer.compute_video_scores(pose_result, face_result, gaze_result)


# ── Endpoints ────────────────────────────────────────────────────────


@router.post(
    "/analyze-frame",
    response_model=FrameAnalysisResponse,
    summary="Analyze a single video frame",
    description=(
        "Accepts a base64-encoded image and returns a full behavioral "
        "analysis including confidence score, engagement score, "
        "emotion classification, and detailed sub-score breakdown."
    ),
)
async def analyze_frame(request: FrameAnalysisRequest):
    """Analyze a single base64-encoded video frame."""
    try:
        result = _analyze_single_frame(request.frame)
        return FrameAnalysisResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Frame analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Analysis failed: {str(e)}",
        )


@router.post(
    "/analyze-batch",
    response_model=BatchAnalysisResponse,
    summary="Analyze multiple video frames",
    description=(
        "Accepts a batch of base64-encoded images and returns "
        "per-frame results plus aggregate statistics (averages, "
        "min/max, emotion distribution). Max 120 frames per batch."
    ),
)
async def analyze_batch(request: BatchAnalysisRequest):
    """Analyze a batch of base64-encoded video frames."""
    try:
        _, _, _, scorer = _get_analyzers()

        frame_results = []
        for i, frame_b64 in enumerate(request.frames):
            try:
                result = _analyze_single_frame(frame_b64)
                frame_results.append(result)
            except HTTPException:
                # Skip individual frame errors in batch mode
                logger.warning(f"Skipped frame {i}: decode error")
                continue
            except Exception as e:
                logger.warning(f"Skipped frame {i}: {e}")
                continue

        if not frame_results:
            raise HTTPException(
                status_code=400,
                detail="No frames could be analyzed successfully",
            )

        summary = scorer.compute_batch_summary(frame_results)
        return BatchAnalysisResponse(**summary)

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Batch analysis failed: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Batch analysis failed: {str(e)}",
        )


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Health check for video analysis models",
    description="Verify that MediaPipe and DeepFace models are loaded.",
)
async def health_check():
    """Check if video analysis models are operational."""
    mediapipe_ok = False
    deepface_ok = False

    try:
        pose, face, gaze, _ = _get_analyzers()
        mediapipe_ok = pose.pose is not None and gaze.face_mesh is not None
        deepface_ok = face.is_loaded
    except Exception as e:
        logger.warning(f"Health check partial failure: {e}")

    status = "healthy" if (mediapipe_ok and deepface_ok) else "degraded"
    if not mediapipe_ok and not deepface_ok:
        status = "unhealthy"

    return HealthResponse(
        status=status,
        mediapipe_loaded=mediapipe_ok,
        deepface_loaded=deepface_ok,
    )
