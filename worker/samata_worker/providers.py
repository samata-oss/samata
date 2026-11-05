"""Builds the STT, LLM and TTS plugins for an assistant's providers.

The control plane picks nothing here: it sends a provider id and the
workspace's API key for each of the model, transcriber and voice, and this
module maps them to LiveKit plugins. Nothing is read from the environment, so
one worker serves every workspace with whatever keys each brought.

Mirrors `control-plane/src/lib/providers.ts`: to add a provider, install its
`livekit-plugins-*` package, add a factory here, and list it there (with its
defaults) so the dashboard offers it.

Plugins are imported at module load, on the main thread, as LiveKit requires.
"""

from __future__ import annotations

from collections.abc import Callable
from typing import Any

from livekit.agents import NOT_GIVEN, llm, stt, tts
from livekit.plugins import assemblyai, cartesia, deepgram, elevenlabs, openai

from samata_worker.config import ModelConfig, TranscriberConfig, VoiceConfig


class ProviderError(Exception):
    """The assistant asks for something this worker can't build."""


def _key(provider: str, api_key: str | None) -> str:
    if not api_key:
        raise ProviderError(f"No API key was provided for {provider}.")
    return api_key


def _clamp(value: float | None, low: float, high: float) -> float | None:
    """Speed multipliers have different ranges per provider; stay inside it."""
    return None if value is None else min(max(value, low), high)


def _drop_none(**kwargs: Any) -> dict[str, Any]:
    return {k: v for k, v in kwargs.items() if v is not None}


# --- LLM ---------------------------------------------------------------------

# Every one of these speaks the OpenAI chat API; the control plane supplies the
# endpoint (`base_url`) for each. `custom` is any other such endpoint.
LLM_PROVIDERS = frozenset({"openai", "openrouter", "vercel-ai-gateway", "groq", "custom"})


def build_llm(cfg: ModelConfig) -> llm.LLM:
    if cfg.provider not in LLM_PROVIDERS:
        raise ProviderError(f"Unknown model provider {cfg.provider!r}.")
    api_key = cfg.api_key
    if not api_key:
        if cfg.provider != "custom":
            raise ProviderError(f"No API key was provided for {cfg.provider}.")
        # Self-hosted endpoints often need none, but the client insists on one.
        api_key = "not-needed"

    kwargs: dict[str, Any] = {"model": cfg.model, "api_key": api_key}
    if cfg.temperature is not None:
        kwargs["temperature"] = cfg.temperature
    if cfg.base_url:
        kwargs["base_url"] = cfg.base_url
    if cfg.provider != "openai":
        # Strict tool schemas are an OpenAI feature: other endpoints (and the
        # models behind a gateway) may reject them. LiveKit's own helpers for
        # third-party hosts turn them off for the same reason.
        kwargs["_strict_tool_schema"] = False
    return openai.LLM(**kwargs)


# --- STT ---------------------------------------------------------------------


def _stt_deepgram(c: TranscriberConfig) -> stt.STT:
    kwargs: dict[str, Any] = {
        "api_key": _key("deepgram", c.api_key),
        "model": c.model,
        "language": c.language,
    }
    if c.keyterms:
        kwargs["keyterm"] = list(c.keyterms)
    return deepgram.STT(**kwargs)


# AssemblyAI's language steering and keyterms are Universal-3 Pro features.
_ASSEMBLYAI_U3 = ("u3-rt-pro", "u3-rt-pro-beta-1", "universal-3-5-pro", "universal-3-6-pro")


def _stt_assemblyai(c: TranscriberConfig) -> stt.STT:
    kwargs: dict[str, Any] = {"api_key": _key("assemblyai", c.api_key), "model": c.model}
    if c.model in _ASSEMBLYAI_U3 and c.language:
        kwargs["language_codes"] = c.language
    if c.keyterms:
        kwargs["keyterms_prompt"] = list(c.keyterms)
    return assemblyai.STT(**kwargs)


def _stt_elevenlabs(c: TranscriberConfig) -> stt.STT:
    kwargs: dict[str, Any] = {
        "api_key": _key("elevenlabs", c.api_key),
        "model": c.model,
        "language_code": c.language,
    }
    if c.keyterms:
        kwargs["keyterms"] = list(c.keyterms)
    return elevenlabs.STT(**kwargs)


def _stt_openai(c: TranscriberConfig) -> stt.STT:
    kwargs: dict[str, Any] = {
        "api_key": _key("openai", c.api_key),
        "model": c.model,
        "language": c.language,
    }
    if c.keyterms:
        # Whisper-style models take free-text context rather than a term list.
        kwargs["prompt"] = "Vocabulary: " + ", ".join(c.keyterms)
    return openai.STT(**kwargs)


STT_PROVIDERS: dict[str, Callable[[TranscriberConfig], stt.STT]] = {
    "deepgram": _stt_deepgram,
    "assemblyai": _stt_assemblyai,
    "elevenlabs": _stt_elevenlabs,
    "openai": _stt_openai,
}


def build_stt(cfg: TranscriberConfig) -> stt.STT:
    factory = STT_PROVIDERS.get(cfg.provider)
    if factory is None:
        raise ProviderError(f"Unknown transcriber provider {cfg.provider!r}.")
    return factory(cfg)


# --- TTS ---------------------------------------------------------------------


def _tts_cartesia(c: VoiceConfig) -> tts.TTS:
    return cartesia.TTS(
        api_key=_key("cartesia", c.api_key),
        model=c.model,
        voice=c.voice_id,
        language=c.language,
        speed=c.speed,
    )


def _tts_elevenlabs(c: VoiceConfig) -> tts.TTS:
    speed = _clamp(c.speed, 0.8, 1.2)
    return elevenlabs.TTS(
        api_key=_key("elevenlabs", c.api_key),
        model=c.model,
        voice_id=c.voice_id,
        # Ignored by models that don't take a language.
        language=c.language,
        voice_settings=(
            elevenlabs.VoiceSettings(stability=0.5, similarity_boost=0.75, speed=speed)
            if speed is not None
            else NOT_GIVEN
        ),
    )


def _tts_deepgram(c: VoiceConfig) -> tts.TTS:
    # The voice is part of the model name (e.g. aura-2-andromeda-en).
    return deepgram.TTS(
        api_key=_key("deepgram", c.api_key),
        model=c.model,
        speed=_clamp(c.speed, 0.7, 1.5),
    )


def _tts_openai(c: VoiceConfig) -> tts.TTS:
    return openai.TTS(
        api_key=_key("openai", c.api_key),
        model=c.model,
        voice=c.voice_id,
        **_drop_none(speed=_clamp(c.speed, 0.25, 4.0)),
    )


TTS_PROVIDERS: dict[str, Callable[[VoiceConfig], tts.TTS]] = {
    "cartesia": _tts_cartesia,
    "elevenlabs": _tts_elevenlabs,
    "deepgram": _tts_deepgram,
    "openai": _tts_openai,
}


def build_tts(cfg: VoiceConfig) -> tts.TTS:
    factory = TTS_PROVIDERS.get(cfg.provider)
    if factory is None:
        raise ProviderError(f"Unknown voice provider {cfg.provider!r}.")
    return factory(cfg)
