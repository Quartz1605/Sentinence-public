# Sentinence Voice Analysis System Overview

This document provides a comprehensive overview of the real-time voice analysis pipeline used in the Sentinence platform. The system is designed for low-latency, multi-modal analysis of speech during simulated interviews.

## 🏗 System Architecture

The system uses a **decoupled dual-loop architecture** over a single WebSocket connection (`/voice/stream`). This allows high-frequency acoustic feedback and periodic semantic analysis to run concurrently without blocking the audio stream.

### 1. Data Ingestion
- **Protocol**: WebSocket (FastAPI based).
- **Input Format**: 16-bit PCM Audio (Mono, 16kHz).
- **Buffer**: A thread-safe `AudioBuffer` normalization layer converts incoming bytes to `float32` arrays for signal processing.

### 2. Deepgram STT Layer (`stt_engine.py`)
- **Integration**: Native WebSocket streaming.
- **Model**: `nova-2-general`.
- **Latency**: Real-time word-level transcription.
- **Configuration**: Uses `keepalive=true` and `smart_format=true` to maintain stable long-duration sessions.
- **Output**: Word-level timestamps (`start`, `end`, `word`) are streamed back to the backend.

### 3. Acoustic Analysis Loop (`audio_features.py`)
- **Interval**: Every **2.0 seconds** of audio data.
- **Engine**: `librosa`.
- **Metrics Extracted**:
  - **Pitch**: Estimated using the Yin algorithm.
  - **Energy**: RMS (Root Mean Square) energy of the signal.
  - **Speaking Rate**: Heuristic based on Zero Crossing Rate (ZCR) and pauses.
- **Output**: Sent to frontend as `periodic_insight` under the `acoustic` key.

### 4. Semantic Analysis Loop (`llm_engine.py`)
- **Interval**: Every **10.0 seconds** of accumulated transcript (chronological spread).
- **Engine**: OpenRouter (Gemini 2.0).
- **Core Methodology**: **Purely Text-Based + Timeline Awareness**. 
  - **Important**: This loop does **NOT** receive raw audio bytes.
  - **The Timing Array**: The LLM receives an array of JSON objects: `[{"word": "hello", "start": 0.5, "end": 0.7}, ...]`.
  - **Inference**: By analyzing the gaps between `start` and `end` times, the LLM infers "pacing" and "silences" (e.g., a 3s gap between words indicates a long hesitation) without needing to process a heavy audio file.
- **Metrics Extracted**:
  - **Stress Level**: Analysis of hesitation, stuttering patterns, and filler word frequency.
  - **Confidence Score**: Behavioral mapping derived from vocabulary and pacing consistency.
  - **Behavioral Insights**: Qualitative feedback on the specific 10s chunk.
- **Output**: Sent to frontend as `periodic_insight` under the `semantic` key.

### 5. Final Session Summary
- **Trigger**: Triggered by the client sending a `"STOP"` text message.
- **Wait Duration**: The frontend provides a **10s grace period** for the LLM to finish final summarization.
- **Functionality**: Performs a holistic analysis of the entire session transcript and aggregates previous periodic insights into a "Key Moments" timeline.

---

## 🛠 File breakdown

| File | Purpose |
| :--- | :--- |
| `websocket_handler.py` | Entry point. Manages auth, socket state, and coordinates the processing loops. |
| `stt_engine.py` | Deepgram WebSocket client. Tunnels raw audio to STT and receives word callbacks. |
| `llm_engine.py` | LLM prompt engineering and API management via OpenRouter. |
| `audio_buffer.py` | Thread-safe NumPy buffer for collecting and normalizing PCM chunks. |
| `audio_features.py` | Mathematical signal processing logic using Librosa. |

## ⚙ Timing Parameters

| Metric | Target Interval | Value in Code |
| :--- | :--- | :--- |
| Audio Sample Rate | N/A | 16,000 Hz |
| Acoustic Loop | ~2 Seconds | 32,000 Samples |
| Semantic Loop | ~10 Seconds | 10.0s word timer delta |
| Graceful Stop | 10 Seconds | 10,000ms (Frontend timeout) |

## ?? Requirement Fulfillment Summary

To satisfy the core requirement for **sub-second STT with behavioral-to-word mapping**, the system implements the following:

1. **Sub-Second Transcripts**: We utilize the **Deepgram Streaming WebSocket** protocol. Unlike batch APIs, it yields partial and final transcripts with millisecond latency, fulfilling the need for immediate text availability.
2. **Raw Text for Semantic Validation**: The backend accumulates these streaming words and periodically flushes them in 10-second blocks to the **LLM (Gemini)**. This provides high-quality semantic validation of intent, repetition, and filler word patterns.
3. **Word-Level Behavioral Mapping**: Because Deepgram provides discrete start and end timestamps for every single word, we can map **behavioral spikes** (detected in our acoustic or semantic loops) to the exact moment they occurred in the speech stream. This ensures feedback is contextually tied to specific sentences or phrases.
