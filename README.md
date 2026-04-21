# Sentinence

Sentinence is an AI-native interview preparation platform that simulates high-pressure hiring environments and gives candidates deep feedback across content quality, communication style, confidence signals, and behavioral consistency.

This repository contains the full product stack:
- `backend/`: FastAPI + MongoDB + AI services + real-time media analysis
- `se-hack/`: Next.js frontend for interview flows, analytics, and coaching UX

It is not just a question-answer bot. Sentinence combines:
- adaptive interview intelligence
- multimodal behavioral analysis (video + voice + text)
- resume understanding and ATS-style coaching
- personalized trend analytics and targeted improvement plans

`winning.txt` confirms this project won SE Hackathon.

## What Sentinence Is Trying To Solve

Most interview prep tools test only one dimension: whether your answer sounds correct. Real interviews evaluate much more:
- how clearly you think under pressure
- how consistently you communicate across time
- whether your non-verbal behavior shows confidence and engagement
- whether your claims are internally consistent
- how effectively you recover when challenged

Sentinence is designed around this broader reality.

## Product Capabilities

## 1) Adaptive 1-on-1 Interview Engine

The 1-on-1 interview flow is built as an adaptive system, not a static question list.

Core behaviors:
- user chooses target role, difficulty, and interviewer persona
- backend generates a complete question bank up front (bounded, deduplicated)
- each answer is evaluated for score, feedback, strengths, and weaknesses
- progression strategy adapts based on performance signals
- persona affects tone and pressure style
- "devil's advocate" mode can generate challenge follow-ups when uncertainty is detected

Additional intelligence:
- latest resume context is loaded and injected into generation prompts
- recent turn history is summarized to preserve continuity
- interview state tracks progress and closes cleanly on completion

## 2) Contradiction and Consistency Detection

Sentinence includes semantic contradiction analysis across past and current statements.

What it does:
- compares new responses against prior claims
- detects high-confidence logical inconsistency (skills, experience, preferences)
- returns structured contradiction metadata including confidence and severity
- supports consistency coaching, not just correctness scoring

Why it matters:
- many candidates fail because answers are individually good but collectively inconsistent
- this module catches that pattern early

## 3) Real-Time Voice Intelligence

The voice pipeline supports live interview feedback loops.

Implemented capabilities:
- websocket-based audio streaming
- live speech-to-text word events
- periodic acoustic and semantic insight payloads
- final summary synthesis at session close
- optional emotion context injection from video analysis into voice context

Captured/derived signals include:
- speaking pace indicators
- confidence/stress semantic cues
- timeline-aligned transcript tokens

## 4) Real-Time Video and Behavioral Intelligence

The video analysis module fuses pose, face, gaze, and emotion signals.

Detected dimensions:
- posture and shoulder alignment
- nervous gesture proxies (including face-touch/fidget patterns)
- head pose and looking-at-screen signal
- pupil ratio derived gaze direction
- emotion distribution and dominant emotion

Scoring outputs:
- confidence score
- engagement score
- per-frame details plus frontend-side aggregation for stable session-level trends

## 5) Group Interview Simulation

Group interviews are modeled as a rotating panel with distinct interviewer tracks.

Key features:
- multi-interviewer flow (technical, HR, mixed)
- turn progression and context carry-over
- per-turn evaluation with strengths/weaknesses
- final session summary with normalized overall score and deduplicated insights
- optional answer transcription from audio when text is absent

This creates realistic context switching between interview styles in one session.

## 6) Team-Fit Meeting Room Simulation

Beyond interviews, Sentinence simulates collaborative meeting scenarios.

What this provides:
- scenario-based team discussion environment
- participant metadata and role context
- message timeline capture
- metrics snapshots over time
- interruption tracking
- final report generation after session completion

This module measures collaboration quality, not just answer quality.

## 7) Resume Parsing and ATS Coaching

Resume intelligence is integrated directly into interview preparation.

Pipeline:
- validate and ingest PDF/DOCX (size/type constrained)
- extract and clean resume text
- parse into structured resume JSON via LLM
- produce ATS-style analysis and actionable tips
- persist parsed artifacts for downstream interview personalization

Fallback behavior is included so users still receive useful output if ATS analysis fails.

## 8) Longitudinal Results and Coaching Analytics

Results are not limited to one session. The analytics module computes trend-level insight across historical data.

Generated outputs include:
- overview metrics (sessions, completion, averages, improvement delta, contradiction rate)
- score trends over time
- communication trend series
- top weakness and strength clustering
- role-wise aggregates
- session snapshots for drill-down
- coaching plan and focus radar (with deterministic fallback if LLM synthesis is unavailable)

This closes the loop from simulation to measurable improvement.

## Architecture

## High-Level System Design

- Frontend (`se-hack`) handles user experience, state orchestration, media capture, and visualization.
- Backend (`backend`) handles authentication, persistence, AI orchestration, scoring logic, and media analysis.
- MongoDB stores users, interview artifacts, resume artifacts, meeting/group sessions, and analytics snapshots.
- LLM providers are used for generation, evaluation, parsing, and synthesis tasks.
- WebSockets are used where low-latency streaming is required (voice and real-time interaction loops).

## Backend Design (FastAPI)

The backend is organized by domain modules under `backend/app/`.

Platform-level responsibilities:
- startup/shutdown lifecycle and DB connection orchestration
- CORS and cookie/session middleware
- auth context injection into requests
- domain router registration
- index initialization for key collections

Major backend subsystems:
- `auth/`: Google OAuth integration, JWT cookie lifecycle, user upsert logic
- `interviews/`: interview session orchestration and persistence
- `interview_agent/`: LLM prompts, question bank generation, evaluation logic, graph-driven adaptation
- `voice/`: streaming audio ingestion and voice analytics websocket handling
- `video_analysis/`: behavioral feature extraction and confidence scoring
- `group_interview/`: rotating panel interview simulation engine
- `meeting_room/`: scenario-based team simulation + reporting
- `resume_parser/`: file parsing + structured extraction + ATS insights
- `results/`: cross-session analytics and coaching synthesis

## Frontend Design (Next.js App Router)

The frontend is a product experience layer, not just a thin API client.

Key concerns handled in `se-hack/`:
- authentication-aware routing and session bootstrap
- interview setup and live interview orchestration
- media permissions, capture, and stream lifecycle
- real-time dashboards for transcript and metrics
- resume upload UX and report rendering
- historical performance visualization and action-plan delivery
- embedded voice assistant launcher for confidence support

State and integration patterns:
- axios client configured with credentials for cookie-based auth
- server/client data fetching patterns depending on UX need
- custom hooks for video capture aggregation and voice websocket management
- composable UI components for overlays, timelines, cards, and charts

## AI and Decisioning Strategy

Sentinence uses AI in layered roles.

Generation layer:
- role/difficulty/persona-specific question generation
- scenario and track-aware prompts for group/meeting contexts

Evaluation layer:
- numeric scoring with structured strengths/weaknesses
- answer quality assessment with low-temperature settings for consistency

Consistency layer:
- contradiction detection against historical memory

Synthesis layer:
- longitudinal performance interpretation
- coaching plans and focus priorities

Multimodal fusion layer:
- combines text intelligence with behavioral audio/video signals

## Data and Persistence Model

Persistence is designed around session continuity and longitudinal analysis.

Core data families stored in MongoDB:
- identity and auth-linked user profile data
- interview sessions and response turns
- structured resume + ATS artifact records
- meeting-room and group-interview transcripts/metrics
- generated analytics snapshots for results dashboard consumption

Indexes are created for user-scoped and session-scoped query performance.

## Real-Time Processing Model

Sentinence uses both request-response and streaming channels.

Streaming channels are used when immediacy is critical:
- live audio ingestion and transcript/insight events
- real-time interaction experiences in interview/meeting contexts

Batch/transactional channels are used when stability and determinism are preferred:
- resume parse and ATS analysis
- interview start/submit lifecycle
- results snapshot generation

This hybrid model keeps UX responsive while preserving robust persistence semantics.

## Repository Structure

```text
Sentinence/
  backend/
    app/
      auth/
      interview_agent/
      interviews/
      meeting_room/
      group_interview/
      resume_parser/
      video_analysis/
      voice/
      results/
      middlewares/
      main.py
      db.py
    requirements.txt
    test_contradiction.py
  se-hack/
    app/
    components/
    hooks/
    lib/
    store/
    package.json
  context.md
  video.md
  winning.txt
```

## Local Setup

## Prerequisites

- Python 3.10+ recommended
- Node.js 18+ recommended
- npm (or compatible package manager)
- MongoDB instance
- API credentials for OAuth + LLM + speech features

## 1) Backend Setup

```bash
cd backend
python -m venv .venv
# Windows PowerShell:
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Run backend:

```bash
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## 2) Frontend Setup

```bash
cd se-hack
npm install
npm run dev
```

Frontend default URL: `http://localhost:3000`
Backend default URL: `http://localhost:8000`

## Environment Variables

## Backend (`backend/.env`)

Required/important variables:
- `MONGO_URI`: MongoDB connection string
- `OPENROUTER_API_KEY`: required for interview intelligence and contradiction analysis
- `GOOGLE_CLIENT_ID`: OAuth client id
- `GOOGLE_CLIENT_SECRET`: OAuth client secret
- `SECRET_KEY` or `JWT_SECRET`: signing secret

Common optional variables:
- `GOOGLE_CLIENT_SECRETS_FILE`: optional JSON secrets file path
- `GOOGLE_REDIRECT_URI`: OAuth callback URI
- `COOKIE_SECURE`: cookie secure flag
- `COOKIE_SAMESITE`: same-site policy
- `POST_LOGIN_REDIRECT_URL`: where user lands after auth
- `CORS_ORIGINS`: allowed frontend origins
- `LOG_LEVEL`: logger verbosity
- `INTERVIEW_MAX_QUESTIONS`: bounded max turns for 1-on-1 interviews
- `GROUP_INTERVIEW_TOTAL_TURNS`: bounded total turns for panel interviews

## Frontend (`se-hack/.env.local`)

- `NEXT_PUBLIC_BACKEND_URL`: browser-side backend base URL
- `BACKEND_URL`: server-side backend base URL (SSR/server calls)
- `NEXT_PUBLIC_VAPI_PUBLIC_KEY`: optional voice assistant integration key

## User Experience Journey

Typical candidate journey through the platform:
1. Sign in with Google.
2. Upload resume and get structured + ATS feedback.
3. Start a 1-on-1 adaptive interview for a target role.
4. Practice under persona-specific pressure (mentor/friendly/aggressive/devil's advocate).
5. Review immediate answer-level feedback plus multimodal confidence signals.
6. Run group interview and meeting-room simulations for broader communication contexts.
7. Open results dashboard to inspect trendline weaknesses/strengths and coaching plan.
8. Repeat and track measurable improvement over time.

## Observability and Operational Notes

Current code includes:
- structured logging across critical backend flows
- index bootstrapping for major collections
- graceful fallback patterns in some AI-dependent paths

Operational recommendations for production hardening:
- centralized secrets management
- API rate limiting/backoff for LLM and speech providers
- websocket connection monitoring and guardrails
- stricter validation and schema evolution strategy
- stronger test coverage for realtime edge cases

## Testing

Current explicit test artifact:
- `backend/test_contradiction.py`

Run it:

```bash
cd backend
python test_contradiction.py
```

Practical next test layers to add:
- interview flow lifecycle tests
- websocket integration tests
- resume parsing fixture tests (PDF/DOCX variations)
- analytics regression tests for aggregation logic
- frontend E2E coverage for core interview journey

## Known Constraints

- heavy dependence on external AI services for core intelligence features
- media analysis quality can degrade with poor camera/mic conditions
- real-time behavior is sensitive to local network stability
- some modules still contain hardcoded assumptions suitable for MVP speed

These are normal for a hackathon-to-product transition stage.

## Why This Architecture Is Strong

Sentinence is compelling because it combines:
- deterministic product logic (session lifecycle, persistence, indexing)
- adaptive AI logic (generation, evaluation, synthesis)
- behavioral signal extraction (video + voice)
- practical coaching output (trend-level weaknesses and action plans)

The result is a full interview-intelligence loop:
practice -> measure -> diagnose -> improve -> repeat.

## Current Maturity Snapshot

This repository already demonstrates:
- cross-domain AI orchestration
- real-time media processing
- modern full-stack product composition
- meaningful user-facing coaching outcomes

In short: this is a serious foundation for a next-generation interview training platform, not a basic demo chatbot.

## License

No license file is currently present at repository root. Add one before public distribution.
