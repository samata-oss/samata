from __future__ import annotations

import tomllib
from dataclasses import dataclass, field, fields
from pathlib import Path
from typing import Any


@dataclass(frozen=True)
class Target:
    name: str
    number: str  # E.164
    notes: str = ""


@dataclass(frozen=True)
class DetectorConfig:
    # Silero speech probability at or above this counts as speech.
    threshold: float = 0.5
    # Consecutive 32 ms windows above threshold before we call it speech.
    onset_windows: int = 3


@dataclass(frozen=True)
class RunConfig:
    calls_per_target: int = 10
    turns_per_call: int = 5
    # Keep this low: concurrent calls load your caller and distort latency.
    concurrency: int = 1
    # First N calls per target are recorded but excluded from reports.
    warmup_calls: int = 1
    utterances_dir: str = "utterances"
    output_dir: str = "results"
    seed: int = 1

    answer_timeout_s: float = 45.0
    # If the callee hasn't spoken this long after answering, assume no greeting.
    greeting_wait_s: float = 4.0
    # Quiet time after the greeting before we start talking.
    greeting_settle_s: float = 1.5
    # Give up on a turn if the agent hasn't started speaking by then.
    response_timeout_s: float = 10.0
    # Agent is "done" once this much silence follows its speech.
    response_end_silence_s: float = 1.2
    # Longest agent reply we'll wait out before ending the call.
    max_response_s: float = 40.0
    inter_turn_pause_s: float = 0.5


@dataclass(frozen=True)
class Config:
    trunk_id: str
    targets: list[Target]
    run: RunConfig = field(default_factory=RunConfig)
    detector: DetectorConfig = field(default_factory=DetectorConfig)


def _build(cls: type, raw: dict[str, Any], section: str):
    known = {f.name for f in fields(cls)}
    unknown = set(raw) - known
    if unknown:
        raise ValueError(f"[{section}] unknown keys: {', '.join(sorted(unknown))}")
    return cls(**raw)


def load_config(
    path: str | Path | None, *, serving: bool = False, env_trunk: str = ""
) -> Config:
    """Read bench.toml. When `serving`, targets come from each job instead, and
    the file itself is optional (the trunk can come from the environment)."""
    raw: dict[str, Any] = {}
    if path and (not serving or Path(path).exists()):
        with open(path, "rb") as f:
            raw = tomllib.load(f)

    trunk_id = env_trunk or raw.get("trunk_id", "")
    if not trunk_id:
        raise ValueError(
            "trunk_id is required: set it in bench.toml or SAMATA_BENCH_TRUNK_ID "
            "(create one with `setup-trunk`)."
        )

    targets = [_build(Target, t, "targets") for t in raw.get("targets", [])]
    if not targets and not serving:
        raise ValueError("Add at least one [[targets]] entry.")
    names = [t.name for t in targets]
    if len(set(names)) != len(names):
        raise ValueError("Target names must be unique.")
    for t in targets:
        if not t.number.startswith("+"):
            raise ValueError(f"Target {t.name}: number must be E.164 (+15551234567).")

    return Config(
        trunk_id=trunk_id,
        targets=targets,
        run=_build(RunConfig, raw.get("run", {}), "run"),
        detector=_build(DetectorConfig, raw.get("detector", {}), "detector"),
    )
