"""Where a demo key's requests go: the demo proxy, not Deepgram.

    .venv/bin/python -m unittest discover -s tests -t .
"""

from __future__ import annotations

import os
import unittest
from unittest import mock

from samata_worker.config import TranscriberConfig, VoiceConfig
from samata_worker.demo import DEFAULT_DEMO_URL, deepgram_endpoint, demo_url, is_demo_key
from samata_worker.providers import _stt_deepgram, _tts_deepgram

DEMO_KEY = "sk_demo_abc.def"
REAL_KEY = "0123456789abcdef"


class EndpointTests(unittest.TestCase):
    def test_only_a_sk_demo_key_is_a_demo_key(self) -> None:
        self.assertTrue(is_demo_key(DEMO_KEY))
        self.assertFalse(is_demo_key(REAL_KEY))
        self.assertFalse(is_demo_key("sk_live_abc"))
        self.assertFalse(is_demo_key(None))
        self.assertFalse(is_demo_key(""))

    def test_the_proxy_address_can_be_overridden(self) -> None:
        with mock.patch.dict(os.environ, {"SAMATA_DEMO_URL": ""}):
            self.assertEqual(demo_url(), DEFAULT_DEMO_URL)
        with mock.patch.dict(os.environ, {"SAMATA_DEMO_URL": "http://localhost:8787/"}):
            self.assertEqual(demo_url(), "http://localhost:8787")

    def test_a_demo_key_goes_to_the_proxy_and_any_other_to_deepgram(self) -> None:
        with mock.patch.dict(os.environ, {"SAMATA_DEMO_URL": "http://demo.test"}):
            self.assertEqual(deepgram_endpoint(DEMO_KEY, "listen"), "http://demo.test/v1/listen")
            self.assertEqual(deepgram_endpoint(DEMO_KEY, "speak"), "http://demo.test/v1/speak")
            self.assertEqual(
                deepgram_endpoint(REAL_KEY, "listen"), "https://api.deepgram.com/v1/listen"
            )


class PluginTests(unittest.TestCase):
    """The LiveKit plugins really are pointed where we say."""

    def test_stt(self) -> None:
        with mock.patch.dict(os.environ, {"SAMATA_DEMO_URL": "http://demo.test"}):
            demo = _stt_deepgram(TranscriberConfig(api_key=DEMO_KEY))
            real = _stt_deepgram(TranscriberConfig(api_key=REAL_KEY))
        self.assertEqual(demo._opts.endpoint_url, "http://demo.test/v1/listen")
        self.assertEqual(real._opts.endpoint_url, "https://api.deepgram.com/v1/listen")

    def test_tts(self) -> None:
        voice = VoiceConfig(provider="deepgram", model="aura-2-andromeda-en")
        with mock.patch.dict(os.environ, {"SAMATA_DEMO_URL": "http://demo.test"}):
            demo = _tts_deepgram(VoiceConfig(**{**voice.__dict__, "api_key": DEMO_KEY}))
            real = _tts_deepgram(VoiceConfig(**{**voice.__dict__, "api_key": REAL_KEY}))
        self.assertEqual(demo._opts.base_url, "http://demo.test/v1/speak")
        self.assertEqual(real._opts.base_url, "https://api.deepgram.com/v1/speak")


if __name__ == "__main__":
    unittest.main()
