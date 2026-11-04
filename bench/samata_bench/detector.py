from __future__ import annotations

import asyncio
import bisect
import time
from typing import Callable

from livekit import rtc
from livekit.agents import vad as agents_vad

SAMPLE_RATE = 16000
WINDOW = 512  # Silero's window at 16 kHz (32 ms)


class SpeechDetector:
    """Finds when the callee starts and stops speaking, in local clock time.

    Inbound audio is resampled to 16 kHz and run through Silero. Every frame is
    stamped with its arrival time (`time.monotonic()`), and each Silero window
    is mapped back to the arrival time of the frame that carried it, so the
    result doesn't depend on how often we poll or how slow inference is.

    The same detector (and settings) is used for every target. It has a small
    constant bias; `python -m samata_bench selftest` measures it.
    """

    def __init__(self, vad, *, threshold: float = 0.5, onset_windows: int = 3) -> None:
        self._stream = vad.stream()
        self._threshold = threshold
        self._onset_windows = onset_windows

        self._pushed = 0
        self._mark_samples: list[int] = []
        self._mark_times: list[float] = []

        self._run = 0
        self._run_start_sample = 0
        self.speaking = False
        self.last_speech_t: float | None = None
        # Arrival times at which speech started (>= onset_windows in a row).
        self.onsets: list[float] = []

        self._tasks: list[asyncio.Task] = []
        self._tasks.append(asyncio.create_task(self._consume()))

    # -- input -----------------------------------------------------------

    def push_frame(self, frame: rtc.AudioFrame) -> None:
        """Feed a 16 kHz mono frame, stamped with the time it arrived."""
        self._mark_samples.append(self._pushed)
        self._mark_times.append(time.monotonic())
        self._pushed += frame.samples_per_channel
        self._stream.push_frame(frame)

    async def feed(self, track: rtc.Track) -> None:
        """Pump a remote audio track into the detector until it ends."""
        stream = rtc.AudioStream(track, sample_rate=SAMPLE_RATE, num_channels=1)
        try:
            async for event in stream:
                self.push_frame(event.frame)
        finally:
            await stream.aclose()

    def start_feeding(self, track: rtc.Track) -> None:
        self._tasks.append(asyncio.create_task(self.feed(track)))

    async def aclose(self) -> None:
        for t in self._tasks:
            t.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)
        await self._stream.aclose()

    # -- analysis --------------------------------------------------------

    def _time_at(self, sample: int) -> float:
        i = bisect.bisect_right(self._mark_samples, max(sample, 0)) - 1
        return self._mark_times[max(i, 0)]

    async def _consume(self) -> None:
        async for ev in self._stream:
            if ev.type != agents_vad.VADEventType.INFERENCE_DONE:
                continue
            end = ev.samples_index
            start = end - WINDOW
            if ev.probability >= self._threshold:
                self._run += 1
                if self._run == 1:
                    self._run_start_sample = start
                self.last_speech_t = self._time_at(end - 1)
                if not self.speaking and self._run >= self._onset_windows:
                    self.speaking = True
                    self.onsets.append(self._time_at(self._run_start_sample))
            else:
                self._run = 0
                # Leave `speaking` set until `quiet_for` says it's over: the
                # caller decides how much silence ends a turn.

    def quiet_for(self, seconds: float) -> bool:
        """True if no speech has arrived for `seconds` and none is in progress."""
        if self._run > 0:
            return False
        last = self.last_speech_t
        if last is None:
            return True
        return time.monotonic() - last >= seconds

    def mark_idle(self) -> None:
        """Forget the current utterance so the next onset is a new one."""
        self.speaking = False

    # -- waiting ---------------------------------------------------------

    async def wait_until(
        self, predicate: Callable[[], bool], timeout: float, poll: float = 0.01
    ) -> bool:
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            if predicate():
                return True
            await asyncio.sleep(poll)
        return predicate()

    async def wait_for_onset(self, after: float, timeout: float) -> float | None:
        """Arrival time of the first speech onset at or after `after`."""

        def found() -> bool:
            return any(t >= after for t in self.onsets)

        if not await self.wait_until(found, timeout):
            return None
        return min(t for t in self.onsets if t >= after)
