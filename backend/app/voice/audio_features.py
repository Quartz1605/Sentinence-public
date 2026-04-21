import librosa
import numpy as np
import asyncio

async def extract_features(audio_chunk: np.ndarray, sample_rate=16000) -> dict:
    """
    Extracts features like energy, pitch, and basic speaking rate/pauses
    """
    def _process():
        # Energy (RMS)
        rms = librosa.feature.rms(y=audio_chunk)
        avg_energy = float(np.mean(rms))

        # Pitch (Fundamental frequency) using Yin (fastest)
        # Define limits (fmin ~ C2, fmax ~ C7)
        try:
            f0 = librosa.yin(y=audio_chunk, fmin=65, fmax=2093, sr=sample_rate)
            # Filter naive voiced/unvoiced by simple criteria (e.g. non-nan)
            valid_pitches = f0[~np.isnan(f0)]
            mean_pitch = float(np.mean(valid_pitches)) if len(valid_pitches) > 0 else 0.0
        except Exception:
            mean_pitch = 0.0

        # Silence detection
        silence_threshold = 0.01
        pauses = int(np.sum(rms < silence_threshold))
        
        # approximate speaking rate based on energy crosses
        zcr = librosa.feature.zero_crossing_rate(audio_chunk)
        speaking_rate_heuristic = float(np.mean(zcr))

        return {
            "energy": avg_energy,
            "pitch": mean_pitch,
            "pauses": pauses,
            "speaking_rate": speaking_rate_heuristic
        }
    
    return await asyncio.to_thread(_process)
