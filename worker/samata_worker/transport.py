"""Network time between this worker and the transport provider (LiveKit).

Vapi reports "from transport" and "to transport": how long audio takes to travel
between its transport provider and the platform. Here the transport is LiveKit
and the platform is this worker, so we read the WebRTC round-trip time of the
worker's connection to the LiveKit server and take half of it each way.

That is only the worker <-> LiveKit leg. The caller <-> LiveKit leg (their
browser or phone line) can't be seen from here, which matches what Vapi's
numbers cover too. Splitting the round trip in two assumes the path is
symmetric, which is close enough for a number meant to be read in milliseconds.
"""

from __future__ import annotations

import asyncio
import logging
import time
from bisect import bisect_right

from livekit import rtc

logger = logging.getLogger("samata.worker")

SAMPLE_INTERVAL_SECONDS = 5.0


def current_rtt(stats: rtc.RtcStats) -> float | None:
    """Round-trip time in seconds on the active connection, or None if unknown."""
    rtts = []
    for group in (stats.publisher_stats, stats.subscriber_stats):
        for s in group:
            if s.WhichOneof("stats") != "candidate_pair":
                continue
            pair = s.candidate_pair.candidate_pair
            if pair.nominated and pair.current_round_trip_time > 0:
                rtts.append(pair.current_round_trip_time)
    return sum(rtts) / len(rtts) if rtts else None


class RttSampler:
    """Samples the round-trip time through the call so each turn can look one up."""

    def __init__(self, room: rtc.Room) -> None:
        self._room = room
        self._times: list[float] = []
        self._rtts: list[float] = []
        self._task: asyncio.Task[None] | None = None

    def start(self) -> None:
        self._task = asyncio.get_running_loop().create_task(self._run())

    def stop(self) -> None:
        if self._task:
            self._task.cancel()

    async def _run(self) -> None:
        while True:
            try:
                rtt = current_rtt(await self._room.get_rtc_stats())
                if rtt is not None:
                    self._times.append(time.time())
                    self._rtts.append(rtt)
            except asyncio.CancelledError:
                raise
            except Exception:
                # Not connected yet, or the stats call failed. Try again later.
                logger.debug("could not read transport round-trip time", exc_info=True)
            await asyncio.sleep(SAMPLE_INTERVAL_SECONDS)

    def samples(self) -> list[tuple[float, float]]:
        """(unix time, round-trip seconds) in time order."""
        return list(zip(self._times, self._rtts))


def rtt_at(samples: list[tuple[float, float]], at: float) -> float | None:
    """The latest sample taken at or before `at`, else the earliest one."""
    if not samples:
        return None
    i = bisect_right([t for t, _ in samples], at)
    return samples[max(i - 1, 0)][1]
