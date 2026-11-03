"""The declarative agent config, as returned by the assistant-request webhook.

Mirrors `control-plane/src/lib/agent-config.ts`. The control plane applies
defaults before responding, so every field here is present; the defaults
below only guard against an older control plane.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class ModelConfig:
    system_prompt: str
    model: str = "gpt-4.1-mini"
    temperature: float | None = None
    base_url: str | None = None


@dataclass(frozen=True)
class VoiceConfig:
    voice_id: str = "f786b574-daa5-4673-aa0c-cbe3e8534c02"
    model: str = "sonic-3"
    language: str = "en"
    speed: float | None = None


@dataclass(frozen=True)
class TranscriberConfig:
    model: str = "nova-3"
    language: str = "en-US"
    keyterms: tuple[str, ...] = ()


@dataclass(frozen=True)
class VadConfig:
    activation_threshold: float = 0.5
    min_speech_duration: float = 0.05
    min_silence_duration: float = 0.3


@dataclass(frozen=True)
class InterruptionConfig:
    enabled: bool = True
    min_duration: float = 0.5
    min_words: int = 0
    resume_false_interruption: bool = True


@dataclass(frozen=True)
class EndpointingConfig:
    min_delay: float = 0.3
    max_delay: float = 1.0


@dataclass(frozen=True)
class PreemptiveGenerationConfig:
    enabled: bool = True
    tts: bool = False


@dataclass(frozen=True)
class ToolConfig:
    name: str
    description: str
    parameters: dict[str, Any]
    message_on_start: str | None = None


@dataclass(frozen=True)
class AssistantConfig:
    id: str
    name: str
    model: ModelConfig
    voice: VoiceConfig = field(default_factory=VoiceConfig)
    transcriber: TranscriberConfig = field(default_factory=TranscriberConfig)
    vad: VadConfig = field(default_factory=VadConfig)
    interruption: InterruptionConfig = field(default_factory=InterruptionConfig)
    endpointing: EndpointingConfig = field(default_factory=EndpointingConfig)
    preemptive_generation: PreemptiveGenerationConfig = field(
        default_factory=PreemptiveGenerationConfig
    )
    tools: tuple[ToolConfig, ...] = ()
    first_message: str | None = None
    end_call_enabled: bool = True
    max_duration_seconds: int = 600

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> AssistantConfig:
        m = d.get("model") or {}
        v = d.get("voice") or {}
        t = d.get("transcriber") or {}
        vad = d.get("vad") or {}
        i = d.get("interruption") or {}
        e = d.get("endpointing") or {}
        p = d.get("preemptiveGeneration") or {}
        return cls(
            id=d["id"],
            name=d.get("name", d["id"]),
            first_message=d.get("firstMessage"),
            model=ModelConfig(
                system_prompt=m.get("systemPrompt", "You are a helpful voice assistant."),
                model=m.get("model", ModelConfig.model),
                temperature=m.get("temperature"),
                base_url=m.get("baseUrl"),
            ),
            voice=VoiceConfig(
                voice_id=v.get("voiceId", VoiceConfig.voice_id),
                model=v.get("model", VoiceConfig.model),
                language=v.get("language", VoiceConfig.language),
                speed=v.get("speed"),
            ),
            transcriber=TranscriberConfig(
                model=t.get("model", TranscriberConfig.model),
                language=t.get("language", TranscriberConfig.language),
                keyterms=tuple(t.get("keyterms") or ()),
            ),
            vad=VadConfig(
                activation_threshold=vad.get("activationThreshold", VadConfig.activation_threshold),
                min_speech_duration=vad.get("minSpeechDuration", VadConfig.min_speech_duration),
                min_silence_duration=vad.get("minSilenceDuration", VadConfig.min_silence_duration),
            ),
            interruption=InterruptionConfig(
                enabled=i.get("enabled", True),
                min_duration=i.get("minDuration", InterruptionConfig.min_duration),
                min_words=i.get("minWords", InterruptionConfig.min_words),
                resume_false_interruption=i.get("resumeFalseInterruption", True),
            ),
            endpointing=EndpointingConfig(
                min_delay=e.get("minDelay", EndpointingConfig.min_delay),
                max_delay=e.get("maxDelay", EndpointingConfig.max_delay),
            ),
            preemptive_generation=PreemptiveGenerationConfig(
                enabled=p.get("enabled", PreemptiveGenerationConfig.enabled),
                tts=p.get("tts", PreemptiveGenerationConfig.tts),
            ),
            tools=tuple(
                ToolConfig(
                    name=tool["name"],
                    description=tool["description"],
                    parameters=tool.get("parameters") or {"type": "object", "properties": {}},
                    message_on_start=tool.get("messageOnStart"),
                )
                for tool in d.get("tools") or ()
            ),
            end_call_enabled=d.get("endCallEnabled", True),
            max_duration_seconds=d.get("maxDurationSeconds", 600),
        )
