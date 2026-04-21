import asyncio
import numpy as np

class AudioBuffer:
    def __init__(self, sample_rate=16000):
        self.sample_rate = sample_rate
        self.buffer = np.array([], dtype=np.float32)
        self.lock = asyncio.Lock()

    async def add_data(self, data: bytes):
        """
        Convert PCM 16-bit incoming bytes into normalized float32 and add to buffer.
        """
        pcm_data = np.frombuffer(data, dtype=np.int16)
        float_data = pcm_data.astype(np.float32) / 32768.0

        async with self.lock:
            self.buffer = np.concatenate((self.buffer, float_data))

    async def get_all(self):
        """
        Retrieves all available data and flushes the buffer.
        """
        async with self.lock:
            if len(self.buffer) == 0:
                return None
            chunk = self.buffer
            self.buffer = np.array([], dtype=np.float32)
            return chunk
