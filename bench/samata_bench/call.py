from __future__ import annotations

import asyncio
import time
from collections import deque
from dataclasses import dataclass, field

from livekit import api, rtc

from .audio import FRAME_MS, Utterance, iter_frames, silence_frame
from .config import RunConfig, Target
from .detector import SpeechDetector

BOT_IDENTITY = "bench-bot"
CALLEE_IDENTITY = "bench-callee"


@dataclass
class TurnResult:
    turn_idx: int
    utterance: str
    latency_ms: float | None
    valid: bool
    invalid_reason: str = ""
    response_ms: float | None = None  # how long the agent spoke
    # The agent never went quiet, so the call can't continue cleanly.
    overran: bool = False


@dataclass
class CallResult:
    room: str
    started_at: float
    answer_ms: float | None = None
    greeting_onset_ms: float | None = None
    turns: list[TurnResult] = field(default_factory=list)
    error: str = ""


class Speaker:
    """Publishes the bot's audio: queued utterances, else steady silence.

    Agents (and the SIP bridge) behave more like a real call when audio flows
    continuously, so we send 10 ms of silence whenever nothing is queued.
    """

    def __init__(self, sample_rate: int) -> None:
        self.sample_rate = sample_rate
        self.source = rtc.AudioSource(sample_rate, 1, queue_size_ms=200)
        self.track = rtc.LocalAudioTrack.create_audio_track("bench-mic", self.source)
        self._pending: deque[rtc.AudioFrame] = deque()
        self._silence = silence_frame(sample_rate)
        self._last_queued = asyncio.Event()
        self._end_t: float | None = None
        self._task = asyncio.create_task(self._pump())

    async def _pump(self) -> None:
        tick = FRAME_MS / 1000
        next_t = time.monotonic()
        while True:
            frame = self._pending.popleft() if self._pending else self._silence
            is_last = frame is not self._silence and not self._pending
            await self.source.capture_frame(frame)
            if is_last:
                # Everything is queued; it finishes playing `queued_duration`
                # from now. Read it before any silence is appended.
                self._end_t = time.monotonic() + self.source.queued_duration
                self._last_queued.set()
            next_t += tick
            delay = next_t - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            else:
                next_t = time.monotonic()

    async def say(self, utt: Utterance) -> tuple[float, float]:
        """Play `utt`. Returns (start, end) as local monotonic times.

        `end` is when the last sample finishes playing out of our side.
        """
        self._last_queued.clear()
        start = time.monotonic()
        self._pending.extend(iter_frames(utt.samples, utt.sample_rate))
        await self._last_queued.wait()
        assert self._end_t is not None
        end = self._end_t
        delay = end - time.monotonic()
        if delay > 0:
            await asyncio.sleep(delay)
        return start, end

    async def aclose(self) -> None:
        self._task.cancel()
        await asyncio.gather(self._task, return_exceptions=True)
        await self.source.aclose()


def _token(key: str, secret: str, room: str) -> str:
    return (
        api.AccessToken(key, secret)
        .with_identity(BOT_IDENTITY)
        .with_grants(api.VideoGrants(room_join=True, room=room))
        .to_jwt()
    )


async def run_call(
    *,
    lkapi: api.LiveKitAPI,
    url: str,
    key: str,
    secret: str,
    trunk_id: str,
    target: Target,
    utterances: list[Utterance],
    vad,
    run: RunConfig,
    detector_cfg,
    room_name: str,
) -> CallResult:
    result = CallResult(room=room_name, started_at=time.time())
    room = rtc.Room()
    callee_audio: asyncio.Future[rtc.Track] = asyncio.get_running_loop().create_future()

    @room.on("track_subscribed")
    def _on_track(track: rtc.Track, _pub, participant: rtc.RemoteParticipant):
        if (
            participant.identity == CALLEE_IDENTITY
            and track.kind == rtc.TrackKind.KIND_AUDIO
            and not callee_audio.done()
        ):
            callee_audio.set_result(track)

    speaker = Speaker(utterances[0].sample_rate)
    detector = SpeechDetector(
        vad,
        threshold=detector_cfg.threshold,
        onset_windows=detector_cfg.onset_windows,
    )
    try:
        await room.connect(url, _token(key, secret, room_name))
        await room.local_participant.publish_track(
            speaker.track,
            rtc.TrackPublishOptions(source=rtc.TrackSource.SOURCE_MICROPHONE),
        )

        t_dial = time.monotonic()
        await lkapi.sip.create_sip_participant(
            api.CreateSIPParticipantRequest(
                sip_trunk_id=trunk_id,
                sip_call_to=target.number,
                room_name=room_name,
                participant_identity=CALLEE_IDENTITY,
                participant_name=target.name,
                wait_until_answered=True,
            ),
            timeout=run.answer_timeout_s,
        )
        t_answered = time.monotonic()
        result.answer_ms = (t_answered - t_dial) * 1000

        track = await asyncio.wait_for(callee_audio, timeout=10)
        detector.start_feeding(track)

        await _wait_out_greeting(detector, run, result, t_answered)

        for i in range(run.turns_per_call):
            utt = utterances[i % len(utterances)]
            turn = await _turn(detector, speaker, utt, i, run)
            result.turns.append(turn)
            if turn.overran:
                result.error = "agent kept talking; call ended early"
                break
            await asyncio.sleep(run.inter_turn_pause_s)
    except Exception as e:  # one bad call shouldn't sink the run
        result.error = f"{type(e).__name__}: {e}"
    finally:
        await detector.aclose()
        await speaker.aclose()
        await room.disconnect()
        try:
            await lkapi.room.delete_room(api.DeleteRoomRequest(room=room_name))
        except Exception:
            pass
    return result


async def _wait_out_greeting(
    detector: SpeechDetector, run: RunConfig, result: CallResult, t_answered: float
) -> None:
    onset = await detector.wait_for_onset(t_answered, run.greeting_wait_s)
    if onset is not None:
        result.greeting_onset_ms = (onset - t_answered) * 1000
        await detector.wait_until(
            lambda: detector.quiet_for(run.greeting_settle_s), timeout=30
        )
    else:
        await asyncio.sleep(run.greeting_settle_s)
    detector.mark_idle()


async def _turn(
    detector: SpeechDetector,
    speaker: Speaker,
    utt: Utterance,
    idx: int,
    run: RunConfig,
) -> TurnResult:
    t_start, t_end = await speaker.say(utt)

    # Any speech that began while we were still talking means the agent
    # barged in (or kept going from before). That's not a response latency.
    early = [t for t in detector.onsets if t_start - 0.2 <= t < t_end]
    if early:
        ended = await _await_response_end(detector, run)
        return TurnResult(
            idx,
            utt.name,
            None,
            False,
            "agent_spoke_during_utterance",
            overran=not ended,
        )

    onset = await detector.wait_for_onset(t_end, run.response_timeout_s)
    if onset is None:
        return TurnResult(idx, utt.name, None, False, "no_response")

    ended = await _await_response_end(detector, run)
    response_ms = (
        ((detector.last_speech_t or onset) - onset) * 1000 if ended else None
    )
    return TurnResult(
        idx,
        utt.name,
        (onset - t_end) * 1000,
        True,
        "",
        response_ms,
        overran=not ended,
    )


async def _await_response_end(detector: SpeechDetector, run: RunConfig) -> bool:
    ok = await detector.wait_until(
        lambda: detector.quiet_for(run.response_end_silence_s),
        timeout=run.max_response_s,
    )
    detector.mark_idle()
    return ok
