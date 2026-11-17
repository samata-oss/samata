"""LiveKit speech plugins for the Speko Router (https://docs.speko.ai/relay).

One Speko key serves the whole cascade: the model goes through the Router's
OpenAI-compatible chat endpoint (see `providers.build_llm`), and this module
adds the two LiveKit has no plugin for:

- `STT`: live transcription over `wss://router.speko.dev/v1/stt/stream`.
- `TTS`: one-shot synthesis over `POST /v1/tts/speech`, streamed back as raw
  PCM. LiveKit splits the reply into sentences and synthesizes each.

A model is named the way the Router's chat endpoint names it: `auto`,
`auto:<objective>` (balanced, quality, latency or cost), or
`<provider>/<model>` to pin one, e.g. `meta/muse-voice-transcribe-1.0`.
"""

from __future__ import annotations

import asyncio
import json
import uuid
from typing import Any

import aiohttp
from livekit import rtc
from livekit.agents import (
    DEFAULT_API_CONNECT_OPTIONS,
    NOT_GIVEN,
    LanguageCode,
    APIConnectionError,
    APIConnectOptions,
    APIStatusError,
    APITimeoutError,
    stt,
    tts,
    utils,
)
from livekit.agents.stt import SpeechEventType
from livekit.agents.types import NotGivenOr
from livekit.agents.utils import http_context, is_given

ROUTER_URL = "https://router.speko.dev"

OBJECTIVES = ("balanced", "quality", "latency", "cost")

# What the Router takes and gives. Speech goes in at 16 kHz, the rate every STT
# route accepts, and comes back at 24 kHz.
STT_SAMPLE_RATE = 16000
TTS_SAMPLE_RATE = 24000
# Audio is sent in 50 ms chunks: small enough for low latency, large enough
# that a call isn't a hundred tiny WebSocket frames a second.
STT_CHUNK_MS = 50


def routing_for(model: str) -> dict[str, str]:
    """The Router's `routing` object for a model name.

    `auto` lets Speko pick the provider; `<provider>/<model>` pins one and never
    falls back. Raises `ValueError` for anything else, so a typo is reported
    when the call starts instead of as a Router error in the middle of it.
    """
    name = model.strip()
    if name == "auto":
        return {"mode": "auto", "objective": "balanced"}
    if name.startswith("auto:"):
        objective = name[len("auto:") :]
        if objective not in OBJECTIVES:
            raise ValueError(
                f"{model!r} isn't a Speko model: the objective must be one of {', '.join(OBJECTIVES)}."
            )
        return {"mode": "auto", "objective": objective}
    provider, _, rest = name.partition("/")
    if not provider or not rest:
        raise ValueError(
            f"{model!r} isn't a Speko model. Use 'auto', 'auto:<objective>' or "
            "'<provider>/<model>', e.g. 'meta/muse-voice-transcribe-1.0'."
        )
    return {"mode": "explicit", "provider": provider, "model": rest}


def _ws_url(base_url: str) -> str:
    return base_url.rstrip("/").replace("https://", "wss://", 1).replace("http://", "ws://", 1)


def _envelope(body: Any) -> dict[str, Any] | None:
    """The `{code, message, retryable}` of a Router error, in or out of its `error` wrapper."""
    if not isinstance(body, dict):
        return None
    inner = body.get("error")
    if isinstance(inner, dict):
        return inner
    return body if "code" in body or "message" in body else None


def _error_fields(body: Any) -> tuple[str, bool | None]:
    """`(message, retryable)` from a Router error, whatever came back."""
    err = _envelope(body)
    if err is None:
        return (str(body) if body else "Speko error"), None
    retryable = err.get("retryable")
    return (
        str(err.get("message") or err.get("code") or "Speko error"),
        retryable if isinstance(retryable, bool) else None,
    )


def _status_error(
    status: int, body: Any, request_id: str = "", *, retryable: bool | None = None
) -> APIStatusError:
    message, from_body = _error_fields(body)
    return APIStatusError(
        message,
        status_code=status,
        request_id=request_id,
        body=body,
        retryable=retryable if retryable is not None else from_body,
    )


class STT(stt.STT):
    """Streaming speech-to-text through the Router."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        language: str = "en",
        base_url: str | None = None,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        super().__init__(
            capabilities=stt.STTCapabilities(
                streaming=True,
                interim_results=True,
                offline_recognize=False,
                # The turn detector asks for the transcript with `input.commit`,
                # which the Router answers with exactly one final.
                manual_flush=True,
            )
        )
        if not api_key:
            raise ValueError("A Speko API key is required.")
        self._api_key = api_key
        self._model = model
        self._routing = routing_for(model)
        self._language = language
        self._base_url = base_url or ROUTER_URL
        self._session = http_session

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "Speko"

    def _ensure_session(self) -> aiohttp.ClientSession:
        if not self._session:
            self._session = http_context.http_session()
        return self._session

    async def _recognize_impl(self, *args: Any, **kwargs: Any) -> stt.SpeechEvent:
        raise NotImplementedError("Speko STT only streams.")

    def stream(
        self,
        *,
        language: NotGivenOr[str] = NOT_GIVEN,
        conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS,
    ) -> SpeechStream:
        return SpeechStream(
            stt=self,
            conn_options=conn_options,
            language=language if is_given(language) else self._language,
        )


class SpeechStream(stt.SpeechStream):
    def __init__(self, *, stt: STT, conn_options: APIConnectOptions, language: str) -> None:
        super().__init__(stt=stt, conn_options=conn_options, sample_rate=STT_SAMPLE_RATE)
        self._speko = stt
        self._language = language
        self._speaking = False
        self._commits = 0

    async def _connect(self) -> aiohttp.ClientWebSocketResponse:
        s = self._speko
        # A fresh key per connection: the Router refuses a reused one whose
        # session.configure differs, and a retry has a new session.
        headers = {
            "Authorization": f"Bearer {s._api_key}",
            "Idempotency-Key": str(uuid.uuid4()),
        }
        try:
            ws = await asyncio.wait_for(
                s._ensure_session().ws_connect(
                    f"{_ws_url(s._base_url)}/v1/stt/stream", headers=headers
                ),
                self._conn_options.timeout,
            )
        except aiohttp.WSServerHandshakeError as e:
            # The upgrade was refused, so the Router's reason isn't available:
            # say the likely one, and don't retry a key it rejected.
            reason = {
                401: "Speko rejected the API key.",
                402: "The Speko account is out of credit.",
                429: "Speko is rate limiting this account.",
            }.get(e.status, f"The Speko Router refused the connection ({e.status}).")
            raise _status_error(e.status, reason) from e
        except asyncio.TimeoutError as e:
            raise APITimeoutError() from e
        except aiohttp.ClientError as e:
            raise APIConnectionError("Couldn't reach the Speko Router.") from e

        # The first frame, within 10 s of connecting.
        await ws.send_str(
            json.dumps(
                {
                    "type": "session.configure",
                    "routing": s._routing,
                    "audio": {
                        "encoding": "pcm_s16le",
                        "sample_rate_hz": STT_SAMPLE_RATE,
                        "channels": 1,
                    },
                    "language": self._language,
                }
            )
        )
        return ws

    async def _run(self) -> None:
        ws = await self._connect()
        closing = False
        audio_seconds = 0.0

        def report_usage() -> None:
            nonlocal audio_seconds
            if audio_seconds > 0:
                self._event_ch.send_nowait(
                    stt.SpeechEvent(
                        type=SpeechEventType.RECOGNITION_USAGE,
                        alternatives=[],
                        recognition_usage=stt.RecognitionUsage(audio_duration=audio_seconds),
                    )
                )
                audio_seconds = 0.0

        async def send_task() -> None:
            nonlocal closing, audio_seconds
            chunks = utils.audio.AudioByteStream(
                sample_rate=STT_SAMPLE_RATE,
                num_channels=1,
                samples_per_channel=STT_SAMPLE_RATE * STT_CHUNK_MS // 1000,
            )

            async def send(frames: list[rtc.AudioFrame]) -> None:
                nonlocal audio_seconds
                for frame in frames:
                    audio_seconds += frame.duration
                    await ws.send_bytes(frame.data.tobytes())

            async for data in self._input_ch:
                if isinstance(data, rtc.AudioFrame):
                    await send(chunks.write(data.data.tobytes()))
                elif isinstance(data, self._FlushSentinel):
                    await send(chunks.flush())
                    self._commits += 1
                    await ws.send_str(
                        json.dumps({"type": "input.commit", "commit_id": f"turn-{self._commits}"})
                    )
                    report_usage()
            # Input ended: ask for what's left, then end the session.
            await send(chunks.flush())
            await ws.send_str(json.dumps({"type": "input.commit"}))
            await ws.send_str(json.dumps({"type": "session.close"}))
            closing = True

        async def recv_task() -> None:
            ready = False
            while True:
                msg = await ws.receive()
                if msg.type in (
                    aiohttp.WSMsgType.CLOSE,
                    aiohttp.WSMsgType.CLOSING,
                    aiohttp.WSMsgType.CLOSED,
                ):
                    if closing:
                        return
                    # The Router ends every session with session.closed or error:
                    # a bare drop means the transcript is incomplete.
                    raise APIConnectionError("The Speko Router closed the connection unexpectedly.")
                if msg.type != aiohttp.WSMsgType.TEXT:
                    continue
                frame = json.loads(msg.data)
                kind = frame.get("type")
                if kind == "session.ready":
                    ready = True
                elif kind == "transcript.delta":
                    self._on_delta(frame.get("text", ""))
                    self._mark_provider_progress()
                elif kind == "transcript.final":
                    self._on_final(frame.get("text", ""))
                    self._mark_provider_progress()
                elif kind == "session.closed":
                    return
                elif kind == "error":
                    raise _status_error(_http_status(frame), frame)

        send = asyncio.create_task(send_task())
        recv = asyncio.create_task(recv_task())
        try:
            await asyncio.wait({send, recv}, return_when=asyncio.FIRST_COMPLETED)
            if recv.done():
                recv.result()  # raises the Router's error, if that's why it ended
                if not closing:
                    # session.closed we didn't ask for (a lease or budget ran
                    # out): reconnect rather than leave the call deaf.
                    raise APIConnectionError("The Speko session ended unexpectedly.")
                return
            send.result()
            # Input ended cleanly: wait for the Router to confirm the close.
            try:
                await asyncio.wait_for(recv, 10)
            except asyncio.TimeoutError:
                pass
        except aiohttp.ClientError as e:
            if closing:
                return
            raise APIConnectionError("The Speko STT connection failed.") from e
        finally:
            report_usage()
            await utils.aio.cancel_and_wait(send, recv)
            await ws.close()

    def _emit(self, type_: SpeechEventType, text: str | None = None) -> None:
        alternatives = []
        if text is not None:
            alternatives = [stt.SpeechData(language=LanguageCode(self._language), text=text)]
        self._event_ch.send_nowait(stt.SpeechEvent(type=type_, alternatives=alternatives))

    def _on_delta(self, text: str) -> None:
        if not text:
            return
        if not self._speaking:
            self._speaking = True
            self._emit(SpeechEventType.START_OF_SPEECH)
        self._emit(SpeechEventType.INTERIM_TRANSCRIPT, text)

    def _on_final(self, text: str) -> None:
        # A commit with nothing left to finalize is answered with an empty final:
        # not a transcript, just the end of the turn.
        if text.strip():
            if not self._speaking:
                self._emit(SpeechEventType.START_OF_SPEECH)
            self._emit(SpeechEventType.FINAL_TRANSCRIPT, text)
            self._emit(SpeechEventType.END_OF_SPEECH)
            self._speaking = False
        elif self._speaking:
            self._emit(SpeechEventType.END_OF_SPEECH)
            self._speaking = False


def _http_status(frame: dict[str, Any]) -> int:
    """An HTTP-like status for a terminal `error` frame, which carries none.

    LiveKit retries on 5xx and 429 and gives up on other 4xx, so a retryable
    Router error maps to 503 and the rest to the status its code stands for.
    """
    err = _envelope(frame) or {}
    code = str(err.get("code", ""))
    if code == "authentication_failed":
        return 401
    if code == "insufficient_credit":
        return 402
    if code in ("concurrency_exhausted", "quota_exhausted"):
        return 429
    return 503 if err.get("retryable") else 400


class TTS(tts.TTS):
    """Text-to-speech through the Router's one-shot endpoint."""

    def __init__(
        self,
        *,
        api_key: str,
        model: str,
        voice: str = "",
        language: str = "en",
        base_url: str | None = None,
        sample_rate: int = TTS_SAMPLE_RATE,
        http_session: aiohttp.ClientSession | None = None,
    ) -> None:
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=sample_rate,
            num_channels=1,
        )
        if not api_key:
            raise ValueError("A Speko API key is required.")
        self._api_key = api_key
        self._model = model
        self._routing = routing_for(model)
        self._voice = voice
        self._language = language
        self._base_url = base_url or ROUTER_URL
        self._session = http_session

    @property
    def model(self) -> str:
        return self._model

    @property
    def provider(self) -> str:
        return "Speko"

    def _ensure_session(self) -> aiohttp.ClientSession:
        if not self._session:
            self._session = http_context.http_session()
        return self._session

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> ChunkedStream:
        return ChunkedStream(tts=self, input_text=text, conn_options=conn_options)


class ChunkedStream(tts.ChunkedStream):
    def __init__(self, *, tts: TTS, input_text: str, conn_options: APIConnectOptions) -> None:
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._speko = tts

    async def _run(self, output_emitter: tts.AudioEmitter) -> None:
        s = self._speko
        body: dict[str, Any] = {
            "routing": s._routing,
            "input": self.input_text,
            "language": s._language,
            "audio": {"encoding": "pcm_s16le", "sample_rate_hz": s.sample_rate, "channels": 1},
        }
        if s._voice:
            # Omitted, the route uses its default voice.
            body["voice"] = s._voice
        headers = {
            "Authorization": f"Bearer {s._api_key}",
            # One per request: a retry of this exact text may reuse it, a new
            # sentence must not.
            "Idempotency-Key": str(uuid.uuid4()),
        }
        try:
            async with s._ensure_session().post(
                f"{s._base_url.rstrip('/')}/v1/tts/speech",
                json=body,
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=60, sock_connect=self._conn_options.timeout),
            ) as res:
                request_id = res.headers.get("Speko-Request-ID", "")
                if res.status != 200:
                    text = await res.text()
                    try:
                        parsed: Any = json.loads(text)
                    except ValueError:
                        parsed = text
                    raise _status_error(res.status, parsed, request_id)
                output_emitter.initialize(
                    request_id=request_id,
                    sample_rate=s.sample_rate,
                    num_channels=1,
                    mime_type="audio/pcm",
                )
                async for chunk in res.content.iter_chunked(4096):
                    output_emitter.push(chunk)
                output_emitter.flush()
        except asyncio.TimeoutError as e:
            raise APITimeoutError() from e
        except aiohttp.ClientError as e:
            raise APIConnectionError("Couldn't reach the Speko Router.") from e
