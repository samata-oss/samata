from __future__ import annotations

import asyncio
import csv
import dataclasses
import json
import os
import platform
import random
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Awaitable, Callable

from livekit import api
from livekit.plugins import silero

from .audio import load_utterances
from .call import CallResult, run_call
from .config import Config

TURN_FIELDS = [
    "run_id",
    "target",
    "call_idx",
    "warmup",
    "turn_idx",
    "utterance",
    "latency_ms",
    "valid",
    "invalid_reason",
    "response_ms",
    "room",
]
CALL_FIELDS = [
    "run_id",
    "target",
    "call_idx",
    "warmup",
    "room",
    "started_at",
    "answer_ms",
    "greeting_onset_ms",
    "turns_recorded",
    "error",
]


def _env(name: str) -> str:
    v = os.environ.get(name, "")
    if not v:
        raise SystemExit(f"{name} must be set (see bench/.env.example).")
    return v


def schedule(cfg: Config) -> list[tuple[int, str]]:
    """(call_idx, target) pairs. Targets are shuffled within each round so
    time of day and drift hit every target equally."""
    rng = random.Random(cfg.run.seed)
    out: list[tuple[int, str]] = []
    names = [t.name for t in cfg.targets]
    for call_idx in range(cfg.run.calls_per_target):
        order = names[:]
        rng.shuffle(order)
        out.extend((call_idx, n) for n in order)
    return out


OnCall = Callable[[str, int, bool, CallResult], Awaitable[None]]


async def execute(
    cfg: Config,
    on_call: OnCall,
    stop: asyncio.Event | None = None,
    run_id: str | None = None,
) -> None:
    """Place every scheduled call, handing each finished one to `on_call`.

    `stop` cancels calls that haven't started; those in flight finish.
    """
    url = _env("LIVEKIT_URL")
    key = _env("LIVEKIT_API_KEY")
    secret = _env("LIVEKIT_API_SECRET")

    utterances = load_utterances(cfg.run.utterances_dir)
    run_id = run_id or datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    vad = silero.VAD.load(sample_rate=16000)
    targets = {t.name: t for t in cfg.targets}
    sem = asyncio.Semaphore(cfg.run.concurrency)

    async with api.LiveKitAPI(url, key, secret) as lkapi:

        async def one(call_idx: int, name: str) -> None:
            target = targets[name]
            warmup = call_idx < cfg.run.warmup_calls
            async with sem:
                if stop is not None and stop.is_set():
                    return
                room_name = f"bench_{run_id}_{name}_{call_idx}_{uuid.uuid4().hex[:6]}"
                room_name = room_name.replace(" ", "-")
                print(f"[{name} #{call_idx}] dialing {target.number}", flush=True)
                res = await run_call(
                    lkapi=lkapi,
                    url=url,
                    key=key,
                    secret=secret,
                    trunk_id=cfg.trunk_id,
                    target=target,
                    utterances=utterances,
                    vad=vad,
                    run=cfg.run,
                    detector_cfg=cfg.detector,
                    room_name=room_name,
                )
            _summarize(name, call_idx, res)
            await on_call(name, call_idx, warmup, res)

        await asyncio.gather(*(one(i, n) for i, n in schedule(cfg)))


def _meta(cfg: Config, config_path: str, run_id: str, utterances: list[str]) -> dict:
    return {
        "run_id": run_id,
        "config_file": config_path,
        "config": dataclasses.asdict(cfg),
        "utterances": utterances,
        "python": platform.python_version(),
        "started_at": datetime.now(timezone.utc).isoformat(),
        "definition": (
            "latency_ms = first speech detected on the callee's audio "
            "minus the moment the last sample of our utterance finished "
            "playing out (local clock, Silero VAD)."
        ),
    }


async def run_benchmark(cfg: Config, config_path: str) -> Path:
    """CLI mode: write results/<run_id>/{turns,calls}.csv."""
    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(cfg.run.output_dir) / run_id
    out_dir.mkdir(parents=True, exist_ok=True)
    names = [u.name for u in load_utterances(cfg.run.utterances_dir)]
    (out_dir / "meta.json").write_text(
        json.dumps(_meta(cfg, config_path, run_id, names), indent=2)
    )

    with (
        open(out_dir / "turns.csv", "w", newline="") as tf,
        open(out_dir / "calls.csv", "w", newline="") as cf,
    ):
        turns = csv.DictWriter(tf, TURN_FIELDS)
        calls = csv.DictWriter(cf, CALL_FIELDS)
        turns.writeheader()
        calls.writeheader()

        async def on_call(name: str, call_idx: int, warmup: bool, res: CallResult):
            _record(turns, calls, tf, cf, run_id, name, call_idx, warmup, res)

        await execute(cfg, on_call, run_id=run_id)

    print(f"\nResults: {out_dir}")
    return out_dir


def _record(turns, calls, tf, cf, run_id, name, call_idx, warmup, res: CallResult):
    for t in res.turns:
        turns.writerow(
            {
                "run_id": run_id,
                "target": name,
                "call_idx": call_idx,
                "warmup": int(warmup),
                "turn_idx": t.turn_idx,
                "utterance": t.utterance,
                "latency_ms": "" if t.latency_ms is None else round(t.latency_ms, 1),
                "valid": int(t.valid),
                "invalid_reason": t.invalid_reason,
                "response_ms": "" if t.response_ms is None else round(t.response_ms, 1),
                "room": res.room,
            }
        )
    calls.writerow(
        {
            "run_id": run_id,
            "target": name,
            "call_idx": call_idx,
            "warmup": int(warmup),
            "room": res.room,
            "started_at": datetime.fromtimestamp(res.started_at, timezone.utc).isoformat(),
            "answer_ms": "" if res.answer_ms is None else round(res.answer_ms, 1),
            "greeting_onset_ms": (
                "" if res.greeting_onset_ms is None else round(res.greeting_onset_ms, 1)
            ),
            "turns_recorded": len(res.turns),
            "error": res.error,
        }
    )
    tf.flush()
    cf.flush()


def _summarize(name: str, call_idx: int, res: CallResult) -> None:
    ok = [t.latency_ms for t in res.turns if t.valid and t.latency_ms is not None]
    summary = f"{len(ok)}/{len(res.turns)} valid turns"
    if ok:
        summary += f", median {sorted(ok)[len(ok) // 2]:.0f} ms"
    if res.error:
        summary += f"  ERROR: {res.error}"
    print(f"[{name} #{call_idx}] {summary}", flush=True)
