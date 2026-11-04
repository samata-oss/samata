"""Runner mode: take benchmark jobs from the control plane.

`python -m samata_bench serve` polls the control plane for queued runs (made
in the dashboard's Benchmarks page), dials the targets, and reports each
finished call back. Uses the same shared secret as the worker.
"""

from __future__ import annotations

import asyncio
import dataclasses
import os
from typing import Any

import aiohttp

from .call import CallResult
from .config import Config, Target, load_config
from .runner import execute

HEARTBEAT_S = 10
POLL_S = 3


class ControlPlane:
    def __init__(self, http: aiohttp.ClientSession) -> None:
        self._http = http
        self._base = os.environ.get("SAMATA_CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
        self._headers = {"x-samata-secret": os.environ.get("SAMATA_WEBHOOK_SECRET", "")}

    async def _post(self, path: str, body: dict[str, Any] | None = None, timeout: float = 20):
        async with self._http.post(
            f"{self._base}/api/bench-runner/{path}",
            json=body or {},
            headers=self._headers,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as res:
            data = await res.json(content_type=None)
            if res.status == 401:
                raise SystemExit("Control plane rejected SAMATA_WEBHOOK_SECRET.")
            if res.status >= 400:
                raise RuntimeError(f"{path}: HTTP {res.status} {data}")
            return data or {}

    async def claim(self) -> dict | None:
        return (await self._post("claim")).get("run")

    async def heartbeat(self, run_id: str) -> bool:
        """Returns True if the run was cancelled."""
        return bool((await self._post(f"runs/{run_id}/heartbeat")).get("cancelled"))

    async def results(self, run_id: str, payload: dict[str, Any]) -> bool:
        """Returns True if the run was cancelled. Retries transient failures."""
        last: Exception | None = None
        for attempt in range(4):
            try:
                return bool((await self._post(f"runs/{run_id}/results", payload)).get("cancelled"))
            except (aiohttp.ClientError, asyncio.TimeoutError, RuntimeError) as e:
                last = e
                await asyncio.sleep(2**attempt)
        raise RuntimeError(f"could not report results: {last}")

    async def complete(self, run_id: str, status: str, error: str | None = None) -> None:
        body: dict[str, Any] = {"status": status}
        if error:
            body["error"] = error[:2000]
        await self._post(f"runs/{run_id}/complete", body)


def _payload(name: str, call_idx: int, warmup: bool, res: CallResult) -> dict[str, Any]:
    return {
        "call": {
            "target": name,
            "callIdx": call_idx,
            "warmup": warmup,
            "answerMs": res.answer_ms,
            "greetingOnsetMs": res.greeting_onset_ms,
            "error": res.error,
        },
        "turns": [
            {
                "target": name,
                "callIdx": call_idx,
                "warmup": warmup,
                "turnIdx": t.turn_idx,
                "utterance": t.utterance,
                "latencyMs": t.latency_ms,
                "valid": t.valid,
                "invalidReason": t.invalid_reason,
                "responseMs": t.response_ms,
            }
            for t in res.turns
        ],
    }


def _job_config(base: Config, job: dict[str, Any]) -> Config:
    jc = job["config"]
    allowed = {n.strip() for n in os.environ.get("SAMATA_BENCH_ALLOWED_NUMBERS", "").split(",") if n.strip()}
    targets = [Target(t["name"], t["number"], t.get("notes", "")) for t in jc["targets"]]
    blocked = [t.number for t in targets if allowed and t.number not in allowed]
    if blocked:
        raise ValueError(
            f"Not in SAMATA_BENCH_ALLOWED_NUMBERS: {', '.join(blocked)}. "
            "Add them on the runner, or clear the allow-list."
        )
    run = dataclasses.replace(
        base.run,
        calls_per_target=jc["callsPerTarget"],
        turns_per_call=jc["turnsPerCall"],
        warmup_calls=jc["warmupCalls"],
        concurrency=jc["concurrency"],
    )
    return dataclasses.replace(base, targets=targets, run=run)


async def _run_job(cp: ControlPlane, base: Config, job: dict[str, Any]) -> None:
    run_id = job["id"]
    print(f"\n=== run {run_id}: {job['name']} ===", flush=True)
    stop = asyncio.Event()

    async def beat() -> None:
        while True:
            await asyncio.sleep(HEARTBEAT_S)
            try:
                if await cp.heartbeat(run_id):
                    stop.set()
            except Exception as e:  # a missed beat is not fatal
                print(f"heartbeat failed: {e}", flush=True)

    async def on_call(name: str, call_idx: int, warmup: bool, res: CallResult) -> None:
        if await cp.results(run_id, _payload(name, call_idx, warmup, res)):
            stop.set()

    heart = asyncio.create_task(beat())
    try:
        cfg = _job_config(base, job)
        await execute(cfg, on_call, stop=stop, run_id=run_id)
        await cp.complete(run_id, "completed")
        print("run complete" + (" (cancelled)" if stop.is_set() else ""), flush=True)
    except (Exception, SystemExit) as e:
        print(f"run failed: {e}", flush=True)
        try:
            await cp.complete(run_id, "failed", f"{type(e).__name__}: {e}")
        except Exception as e2:
            print(f"could not report failure: {e2}", flush=True)
    finally:
        heart.cancel()
        await asyncio.gather(heart, return_exceptions=True)


async def serve(config_path: str) -> None:
    base = load_config(
        config_path, serving=True, env_trunk=os.environ.get("SAMATA_BENCH_TRUNK_ID", "")
    )
    async with aiohttp.ClientSession() as http:
        cp = ControlPlane(http)
        print(f"Bench runner polling {cp._base} (Ctrl-C to stop)", flush=True)
        while True:
            try:
                job = await cp.claim()
            except SystemExit:
                raise
            except Exception as e:
                print(f"control plane unreachable: {e}", flush=True)
                await asyncio.sleep(POLL_S * 2)
                continue
            if job is None:
                await asyncio.sleep(POLL_S)
                continue
            await _run_job(cp, base, job)
