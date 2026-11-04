from __future__ import annotations

import wave
from dataclasses import dataclass
from pathlib import Path
from typing import Iterator

import numpy as np
from livekit import rtc

FRAME_MS = 10


@dataclass(frozen=True)
class Utterance:
    name: str
    samples: np.ndarray  # int16 mono
    sample_rate: int

    @property
    def duration_s(self) -> float:
        return len(self.samples) / self.sample_rate


def trim_trailing_silence(
    samples: np.ndarray, sample_rate: int, threshold: int = 300, keep_ms: int = 30
) -> np.ndarray:
    """Drop quiet audio at the end so the end of the file is the end of speech.

    Latency is measured from the last sample we send, so trailing silence in a
    TTS file would silently shorten every measurement.
    """
    loud = np.flatnonzero(np.abs(samples.astype(np.int32)) > threshold)
    if loud.size == 0:
        return samples
    end = min(len(samples), int(loud[-1]) + 1 + sample_rate * keep_ms // 1000)
    return samples[:end]


def load_wav(path: Path) -> Utterance:
    with wave.open(str(path), "rb") as w:
        if w.getnchannels() != 1 or w.getsampwidth() != 2:
            raise ValueError(f"{path}: need 16-bit mono WAV")
        sr = w.getframerate()
        raw = w.readframes(w.getnframes())
    samples = np.frombuffer(raw, dtype="<i2").copy()
    return Utterance(path.stem, trim_trailing_silence(samples, sr), sr)


def load_utterances(directory: str | Path) -> list[Utterance]:
    paths = sorted(Path(directory).glob("*.wav"))
    if not paths:
        raise FileNotFoundError(
            f"No .wav files in {directory}. Run `python -m samata_bench gen-utterances`."
        )
    utts = [load_wav(p) for p in paths]
    rates = {u.sample_rate for u in utts}
    if len(rates) != 1:
        raise ValueError(f"All utterances must share a sample rate, got {sorted(rates)}")
    return utts


def write_wav(path: Path, samples: np.ndarray, sample_rate: int) -> None:
    with wave.open(str(path), "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)
        w.setframerate(sample_rate)
        w.writeframes(samples.astype("<i2").tobytes())


def iter_frames(samples: np.ndarray, sample_rate: int) -> Iterator[rtc.AudioFrame]:
    """Split audio into 10 ms frames (the last one zero-padded)."""
    n = sample_rate * FRAME_MS // 1000
    for i in range(0, len(samples), n):
        chunk = samples[i : i + n]
        frame = rtc.AudioFrame.create(sample_rate, 1, n)
        buf = np.frombuffer(frame.data, dtype=np.int16)
        buf[: len(chunk)] = chunk
        if len(chunk) < n:
            buf[len(chunk) :] = 0
        yield frame


def silence_frame(sample_rate: int) -> rtc.AudioFrame:
    return rtc.AudioFrame.create(sample_rate, 1, sample_rate * FRAME_MS // 1000)
