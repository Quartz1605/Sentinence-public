# Video Analysis Module — Feature Documentation

This document describes every feature used in the Sentience video analysis pipeline. The module performs real-time behavioral intelligence on interview candidates by extracting skeletal, facial, and ocular data from video frames using **MediaPipe** and **DeepFace**.

---

## Technology Stack

| Library | Version | Purpose |
|---------|---------|---------|
| **MediaPipe** | latest | Pose estimation (33 body landmarks), hand tracking (21 per hand), face mesh (468 + 10 iris landmarks) |
| **OpenCV** | latest | Frame decoding, image manipulation, `solvePnP` for 3D head pose estimation |
| **DeepFace** | latest | Facial emotion classification using deep learning backends |
| **NumPy** | latest | Linear algebra for angle calculations, vector math, and statistical aggregation |

---

## Module Architecture

```
backend/app/video_analysis/
├── __init__.py            # Package init
├── router.py              # FastAPI endpoints (/video/*)
├── schemas.py             # Pydantic request/response models
├── pose_analyzer.py       # Body pose, shoulder, gesture analysis
├── face_analyzer.py       # Emotion classification
├── gaze_analyzer.py       # Pupil, gaze, head pose tracking
├── confidence_scorer.py   # Score aggregation engine
└── utils.py               # Shared math/decoding helpers
```

---

## Feature 1: Skeletal Coordinate Extraction

**File:** `pose_analyzer.py`  
**Engine:** MediaPipe Pose  

MediaPipe Pose detects **33 3D body landmarks** per frame. Each landmark provides:
- `x`, `y` — Normalized coordinates [0.0, 1.0] relative to frame dimensions
- `z` — Depth relative to hip midpoint (smaller = closer to camera)
- `visibility` — Confidence that the landmark is visible (not occluded)

### Key Landmarks Used

| Index | Landmark | Usage |
|-------|----------|-------|
| 0 | Nose | Spine alignment reference |
| 11 | Left Shoulder | Shoulder tilt calculation |
| 12 | Right Shoulder | Shoulder tilt calculation |
| 13-14 | Elbows | Arm position tracking |
| 15-16 | Wrists | Hand proximity to face |
| 23 | Left Hip | Posture/spine angle |
| 24 | Right Hip | Posture/spine angle |

These coordinates form the basis for all posture and gesture metrics.

---

## Feature 2: Shoulder Alignment Detection

**File:** `pose_analyzer.py` → `get_shoulder_alignment()`  

Measures whether the candidate's shoulders are level, indicating composure and confidence.

### Algorithm
1. Extract landmarks 11 (left shoulder) and 12 (right shoulder)
2. Compute the tilt angle: `angle = atan2(y_right - y_left, x_right - x_left)`
3. Convert to degrees and take absolute value

### Scoring
```
score = max(0.0, 1.0 - (|tilt_angle| / 20.0))
```
- **1.0** = Perfectly level shoulders (0° tilt)
- **0.0** = Severely tilted (≥20°)
- Threshold of 20° chosen because clinical posture studies flag tilts >15° as significant asymmetry

### Behavioral Insight
Shoulder tilting often occurs unconsciously when a candidate leans on one arm, slumps to one side under stress, or shifts their weight due to nervousness.

---

## Feature 3: Nervous Gesture Detection

**File:** `pose_analyzer.py` → `detect_nervous_gestures()`  

Detects self-soothing behaviors that indicate anxiety, such as face-touching and fidgeting.

### Face-Touching Detection
1. Calculate the Euclidean distance between each wrist landmark (15, 16) and the nose landmark (0)
2. If distance < threshold (normalized 0.15), count as a "face touch" event
3. Track count over a sliding temporal window (last 30 frames ≈ 1 second at 30fps)

### Fidgeting Detection
1. Track wrist positions over the temporal window
2. Compute the variance of the (x, y) positions
3. High variance = hands moving erratically = fidgeting

### Scoring
```
gesture_score = max(0.0, 1.0 - (face_touch_freq * 0.15) - (fidget_score * 0.5))
```
- Face touching is penalized per occurrence (15% per touch in the window)
- Fidgeting is penalized based on movement variance

### Behavioral Insight
Research in nonverbal communication shows that face-touching frequency increases by 30-50% under interview stress. Fidgeting (hand wringing, tapping, adjusting clothing) signals internal anxiety.

---

## Feature 4: Hand and Face Landmark Tracking

**File:** `pose_analyzer.py`  
**Engines:** MediaPipe Hands + MediaPipe Face Mesh  

### Hand Landmarks (21 per hand)
MediaPipe Hands provides 21 landmarks per detected hand, covering:
- Wrist (0)
- Thumb (1-4)
- Index finger (5-8)
- Middle finger (9-12)
- Ring finger (13-16)
- Pinky (17-20)

Used for: gesture classification, hand-to-face proximity, fidgeting analysis

### Face Mesh Landmarks (468 + 10 iris)
MediaPipe Face Mesh provides 468 facial landmarks covering:
- Face oval contour
- Eyebrows (left and right)
- Eye contours (left and right)
- Nose bridge and tip
- Lip contours (inner and outer)
- Plus 10 iris landmarks when `refine_landmarks=True`

Used for: head pose estimation, pupil tracking, gaze direction, and providing face region to DeepFace

---

## Feature 5: Facial Expression Classification

**File:** `face_analyzer.py`  
**Engine:** DeepFace  

Classifies the candidate's facial expression into one of **7 primary emotional states**.

### Emotions Detected
| Emotion | Confidence Modifier | Interpretation |
|---------|-------------------|----------------|
| Happy | +0.10 | Positive engagement, rapport |
| Neutral | +0.00 | Baseline composure |
| Surprise | -0.05 | Caught off-guard, mild stress |
| Sad | -0.10 | Discomfort, low energy |
| Angry | -0.10 | Frustration, defensiveness |
| Fear | -0.15 | High anxiety, panic |
| Disgust | -0.15 | Strong negative reaction |

### How It Works
1. DeepFace receives the full frame
2. Internal face detector crops the face region
3. A CNN classifies the expression into probabilities across all 7 emotions
4. The dominant emotion (highest probability) is returned with the full probability distribution
5. `enforce_detection=False` prevents crashes when no face is detected in a frame

### Integration with Confidence Score
The dominant emotion applies a **modifier** to the body-based confidence score. A happy expression boosts confidence; fear or disgust indicates stress and reduces the score.

---

## Feature 6: Pupil Tracking

**File:** `gaze_analyzer.py` → `track_pupils()`  
**Engine:** MediaPipe Face Mesh (with `refine_landmarks=True`)  

Tracks the position of both pupils within their respective eye sockets.

### Iris Landmark Indices
- **Left iris:** 468 (center), 469-472 (perimeter)
- **Right iris:** 473 (center), 474-477 (perimeter)

### Algorithm
1. Extract iris center landmarks (468, 473)
2. Extract eye corner landmarks to define the eye bounding box
   - Left eye: landmarks 33 (outer corner), 133 (inner corner), 159 (top), 145 (bottom)
   - Right eye: landmarks 362 (outer corner), 263 (inner corner), 386 (top), 374 (bottom)
3. Compute the **pupil ratio**: position of iris center relative to eye bounding box
   - `ratio_x = (iris_x - eye_left) / (eye_right - eye_left)`
   - `ratio_y = (iris_y - eye_top) / (eye_bottom - eye_top)`
4. A ratio near (0.5, 0.5) means looking straight ahead (at the camera)

### Output
```json
{
  "left_pupil_ratio": [0.48, 0.51],
  "right_pupil_ratio": [0.52, 0.49],
  "gaze_direction": "center"
}
```

---

## Feature 7: Gaze Direction Detection

**File:** `gaze_analyzer.py` → `get_gaze_direction()`  

Classifies where the candidate is looking based on pupil ratios.

### Direction Classification
| Pupil Ratio X | Pupil Ratio Y | Direction |
|--------------|--------------|-----------|
| 0.35 - 0.65 | 0.35 - 0.65 | Center (looking at screen) |
| < 0.35 | any | Looking Right (from camera's perspective) |
| > 0.65 | any | Looking Left |
| any | < 0.35 | Looking Up |
| any | > 0.65 | Looking Down |

### Engagement Implication
- **Center** = engaged, maintaining eye contact
- **Left/Right** = distracted, reading notes, looking at another screen
- **Up** = recalling information (can be normal during thinking)
- **Down** = disengaged, reading notes, avoiding eye contact

---

## Feature 8: Head Pose Estimation

**File:** `gaze_analyzer.py` → `estimate_head_pose()`  
**Technique:** Perspective-n-Point (PnP) solving with OpenCV  

Estimates the 3D orientation of the candidate's head to determine if they're facing the screen.

### Method: `cv2.solvePnP()`
Maps 2D face landmark pixel coordinates to a generic 3D face model to compute rotation vectors.

### 3D Model Points (Generic Face)
```
Nose tip:      (0.0, 0.0, 0.0)
Chin:          (0.0, -330.0, -65.0)
Left eye:      (-225.0, 170.0, -135.0)
Right eye:     (225.0, 170.0, -135.0)
Left mouth:    (-150.0, -150.0, -125.0)
Right mouth:   (150.0, -150.0, -125.0)
```

### 2D Image Points (From Face Mesh)
| Point | Landmark Index |
|-------|---------------|
| Nose tip | 1 |
| Chin | 199 |
| Left eye left corner | 33 |
| Right eye right corner | 263 |
| Left mouth corner | 61 |
| Right mouth corner | 291 |

### Camera Intrinsics (Estimated)
```
focal_length = frame_width
center = (frame_width / 2, frame_height / 2)
camera_matrix = [[focal_length, 0, center_x],
                 [0, focal_length, center_y],
                 [0, 0, 1]]
```

### Output: Euler Angles
- **Pitch** (nodding up/down): ±10° = looking at screen
- **Yaw** (turning left/right): ±15° = facing screen
- **Roll** (tilting head): informational

### Engagement Check
```
looking_at_screen = (|yaw| < 15°) AND (|pitch| < 10°)
```

---

## Scoring System

### Confidence Score (0.0 - 1.0)
Measures the candidate's **physical composure and confidence**.

```
body_confidence = (0.30 × shoulder_score) + (0.35 × gesture_score) + (0.35 × posture_score)
confidence_score = clamp(body_confidence + emotion_modifier, 0.0, 1.0)
```

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Shoulder alignment | 30% | Level shoulders = composure |
| Nervous gestures | 35% | Low fidgeting/face-touching = calm |
| Posture | 35% | Upright spine = confidence |
| Emotion modifier | ±15% | Facial expression boost/penalty |

### Engagement Score (0.0 - 1.0)
Measures the candidate's **visual attention and eye contact**.

```
engagement = (0.40 × gaze_center_score) + (0.30 × head_yaw_score) + (0.30 × head_pitch_score)
```

| Component | Weight | What it measures |
|-----------|--------|-----------------|
| Gaze centering | 40% | Pupils looking at camera |
| Head yaw | 30% | Face turned toward screen |
| Head pitch | 30% | Head not tilting up/down excessively |

### Final Integration
The video module outputs `confidence_score` and `engagement_score`. These are designed to be combined with audio and text module scores downstream:

```
final_score = (w1 × video_confidence) + (w2 × video_engagement) + (w3 × audio_score) + (w4 × text_score)
```

The weights (w1-w4) are configured at the integration layer, not within this module.

---

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `POST /video/analyze-frame` | POST | Analyze a single base64-encoded frame |
| `POST /video/analyze-batch` | POST | Analyze multiple frames, returns per-frame + averages |
| `GET /video/health` | GET | Health check for loaded models |

### Example Request
```json
POST /video/analyze-frame
{
  "frame": "data:image/jpeg;base64,/9j/4AAQ..."
}
```

### Example Response
```json
{
  "confidence_score": 0.82,
  "engagement_score": 0.91,
  "dominant_emotion": "neutral",
  "details": {
    "shoulder_alignment": { "angle_deg": 2.3, "is_aligned": true, "score": 0.88 },
    "posture": { "spine_angle_deg": 5.1, "is_upright": true, "score": 0.83 },
    "nervous_gestures": { "face_touch_count": 0, "fidgeting_score": 0.12, "score": 0.94 },
    "head_pose": { "pitch": -3.2, "yaw": 5.1, "roll": 1.2, "looking_at_screen": true },
    "gaze": { "left_pupil_ratio": [0.48, 0.51], "right_pupil_ratio": [0.52, 0.49], "direction": "center" },
    "emotion_breakdown": { "neutral": 0.65, "happy": 0.20, "surprise": 0.08, "sad": 0.03, "angry": 0.02, "fear": 0.01, "disgust": 0.01 }
  }
}
```
