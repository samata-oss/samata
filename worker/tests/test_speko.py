"""Speko plugins against a fake Router that follows the documented protocol.

    .venv/bin/python -m unittest discover -s tests -t .

No Speko key or network needed. This checks our side of the contract (headers,
the first frame, commits, error handling); it can't tell you the real Router
still behaves as documented.
"""

from __future__ import annotations

import asyncio
import json
import unittest

import aiohttp
from aiohttp import web
from livekit import rtc
from livekit.agents import APIStatusError
from livekit.agents.stt import SpeechEventType

from samata_worker.speko import STT, TTS, routing_for

PCM = b"\x01\x00" * 2400  # 100 ms at 24 kHz


class FakeRouter:
    def __init__(self) -> None:
        self.stt_headers: dict[str, str] = {}
        self.stt_configure: dict = {}
        self.stt_audio_bytes = 0
        self.stt_commits: list[dict] = []
        self.tts_body: dict = {}
        self.tts_headers: dict[str, str] = {}
        self.valid_key = "sk_speko_test"

    def _authorized(self, request: web.Request) -> bool:
        return request.headers.get("Authorization") == f"Bearer {self.valid_key}"

    async def stt_stream(self, request: web.Request) -> web.StreamResponse:
        if not self._authorized(request):
            return web.json_response(
                {"error": {"code": "authentication_failed", "message": "bad key"}}, status=401
            )
        self.stt_headers = dict(request.headers)
        ws = web.WebSocketResponse()
        await ws.prepare(request)
        first = await ws.receive_str()
        self.stt_configure = json.loads(first)
        await ws.send_json({"type": "session.ready", "request_id": "rreq_1", "route": {}})
        sent_delta = False
        async for msg in ws:
            if msg.type == aiohttp.WSMsgType.BINARY:
                self.stt_audio_bytes += len(msg.data)
                if not sent_delta:
                    sent_delta = True
                    await ws.send_json({"type": "transcript.delta", "text": "hello"})
            elif msg.type == aiohttp.WSMsgType.TEXT:
                frame = json.loads(msg.data)
                if frame["type"] == "input.commit":
                    self.stt_commits.append(frame)
                    await ws.send_json(
                        {
                            "type": "transcript.final",
                            "text": "hello world" if sent_delta else "",
                            **({"commit_id": frame["commit_id"]} if "commit_id" in frame else {}),
                        }
                    )
                elif frame["type"] == "session.close":
                    await ws.send_json({"type": "session.closed", "usage": {}})
                    break
        return ws

    async def tts_speech(self, request: web.Request) -> web.StreamResponse:
        if not self._authorized(request):
            return web.json_response(
                {"error": {"code": "authentication_failed", "message": "bad key"}}, status=401
            )
        self.tts_headers = dict(request.headers)
        self.tts_body = await request.json()
        res = web.StreamResponse(headers={"Speko-Request-ID": "rreq_2"})
        await res.prepare(request)
        await res.write(PCM[:1000])
        await res.write(PCM[1000:])
        return res


class SpekoTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self) -> None:
        self.router = FakeRouter()
        app = web.Application()
        app.router.add_get("/v1/stt/stream", self.router.stt_stream)
        app.router.add_post("/v1/tts/speech", self.router.tts_speech)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        port = site._server.sockets[0].getsockname()[1]  # type: ignore[union-attr]
        self.base = f"http://127.0.0.1:{port}"
        self.session = aiohttp.ClientSession()

    async def asyncTearDown(self) -> None:
        await self.session.close()
        await self.runner.cleanup()

    def test_routing(self) -> None:
        self.assertEqual(routing_for("auto"), {"mode": "auto", "objective": "balanced"})
        self.assertEqual(routing_for("auto:cost"), {"mode": "auto", "objective": "cost"})
        self.assertEqual(
            routing_for("baseten/deepseek-ai/DeepSeek-V4.1-Flash"),
            {"mode": "explicit", "provider": "baseten", "model": "deepseek-ai/DeepSeek-V4.1-Flash"},
        )
        for bad in ("", "gpt-4.1", "auto:fast", "/model", "provider/"):
            with self.assertRaises(ValueError, msg=bad):
                routing_for(bad)

    async def test_stt_turn(self) -> None:
        model = "meta/muse-voice-transcribe-1.0"
        engine = STT(
            api_key="sk_speko_test",
            model=model,
            language="en",
            base_url=self.base,
            http_session=self.session,
        )
        stream = engine.stream()
        for _ in range(20):  # 200 ms of audio, in LiveKit's 10 ms frames
            stream.push_frame(rtc.AudioFrame.create(16000, 1, 160))
        stream.flush()

        events = []
        async with asyncio.timeout(5):
            async for ev in stream:
                events.append(ev)
                if ev.type == SpeechEventType.END_OF_SPEECH:
                    break
        stream.end_input()
        await stream.aclose()

        kinds = [e.type for e in events if e.type != SpeechEventType.RECOGNITION_USAGE]
        self.assertEqual(
            kinds,
            [
                SpeechEventType.START_OF_SPEECH,
                SpeechEventType.INTERIM_TRANSCRIPT,
                SpeechEventType.FINAL_TRANSCRIPT,
                SpeechEventType.END_OF_SPEECH,
            ],
        )
        final = next(e for e in events if e.type == SpeechEventType.FINAL_TRANSCRIPT)
        self.assertEqual(final.alternatives[0].text, "hello world")

        r = self.router
        self.assertEqual(r.stt_headers["Authorization"], "Bearer sk_speko_test")
        self.assertTrue(r.stt_headers["Idempotency-Key"])
        self.assertEqual(r.stt_configure["type"], "session.configure")
        self.assertEqual(
            r.stt_configure["routing"],
            {"mode": "explicit", "provider": "meta", "model": "muse-voice-transcribe-1.0"},
        )
        self.assertEqual(
            r.stt_configure["audio"],
            {"encoding": "pcm_s16le", "sample_rate_hz": 16000, "channels": 1},
        )
        self.assertEqual(r.stt_configure["language"], "en")
        self.assertEqual(r.stt_audio_bytes, 20 * 160 * 2)
        self.assertEqual(r.stt_commits[0]["commit_id"], "turn-1")

    async def test_stt_empty_final_is_not_a_transcript(self) -> None:
        engine = STT(
            api_key="sk_speko_test", model="auto", base_url=self.base, http_session=self.session
        )
        stream = engine.stream()
        stream.flush()  # a commit with no audio: the Router answers with an empty final
        stream.end_input()
        events = [e async for e in stream]
        self.assertEqual(
            [e for e in events if e.type == SpeechEventType.FINAL_TRANSCRIPT], []
        )

    async def test_stt_bad_key_is_not_retried(self) -> None:
        engine = STT(
            api_key="sk_speko_wrong", model="auto", base_url=self.base, http_session=self.session
        )
        stream = engine.stream()
        with self.assertRaises(APIStatusError) as caught:
            async with asyncio.timeout(5):
                async for _ in stream:
                    pass
        self.assertEqual(caught.exception.status_code, 401)
        self.assertFalse(caught.exception.retryable)
        await stream.aclose()

    async def test_tts(self) -> None:
        engine = TTS(
            api_key="sk_speko_test",
            model="inworld/inworld-tts-2",
            language="en",
            base_url=self.base,
            http_session=self.session,
        )
        stream = engine.synthesize("Hello there.")
        pcm = b""
        async with asyncio.timeout(5):
            async for audio in stream:
                pcm += audio.frame.data.tobytes()
        await stream.aclose()

        # LiveKit pads the last frame with silence, so the audio is a prefix.
        self.assertTrue(pcm.startswith(PCM))
        self.assertEqual(pcm[len(PCM) :].strip(b"\x00"), b"")
        body = self.router.tts_body
        self.assertEqual(body["input"], "Hello there.")
        self.assertEqual(
            body["routing"],
            {"mode": "explicit", "provider": "inworld", "model": "inworld-tts-2"},
        )
        self.assertEqual(
            body["audio"], {"encoding": "pcm_s16le", "sample_rate_hz": 24000, "channels": 1}
        )
        self.assertNotIn("voice", body)  # empty voice: the route's default
        self.assertTrue(self.router.tts_headers["Idempotency-Key"])

    async def test_tts_sends_a_chosen_voice(self) -> None:
        engine = TTS(
            api_key="sk_speko_test",
            model="auto",
            voice="Ashley",
            base_url=self.base,
            http_session=self.session,
        )
        stream = engine.synthesize("Hi.")
        async for _ in stream:
            pass
        await stream.aclose()
        self.assertEqual(self.router.tts_body["voice"], "Ashley")

    async def test_tts_bad_key_is_not_retried(self) -> None:
        engine = TTS(
            api_key="sk_speko_wrong", model="auto", base_url=self.base, http_session=self.session
        )
        stream = engine.synthesize("Hi.")
        with self.assertRaises(APIStatusError) as caught:
            async for _ in stream:
                pass
        self.assertEqual(caught.exception.status_code, 401)
        self.assertEqual(caught.exception.message, "bad key")
        await stream.aclose()


if __name__ == "__main__":
    unittest.main()
