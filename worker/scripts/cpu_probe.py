"""Log worker CPU while you make a call, then line it up with each turn.

    worker/.venv/bin/python worker/scripts/cpu_probe.py

Leave it running, make a call, hang up, then press Ctrl-C. It samples the
worker (`main.py`) and all of its child processes (LiveKit runs each call in a
child) twice a second, then looks up your latest call and prints, for every
turn, the worker's peak CPU while that turn was happening next to its LLM time.

CPU is per core, as in `top`: 100% is one full core, so 12 cores can reach
1200%. A worker process pinned near 100% means its event loop is saturated.

The call is read from the local docker postgres. Override with SAMATA_PG_CONTAINER
(default samata-postgres-1) if yours is named differently.
"""

from __future__ import annotations

import json
import os
import subprocess
import sys
import time

import psutil

INTERVAL = 0.5
PG_CONTAINER = os.environ.get("SAMATA_PG_CONTAINER", "samata-postgres-1")


_seen: dict[int, psutil.Process] = {}


def _track(p: psutil.Process) -> psutil.Process:
    """Reuse one Process object per pid: `cpu_percent` reads 0 on a fresh object."""
    if p.pid not in _seen:
        _seen[p.pid] = p
        try:
            p.cpu_percent(interval=None)  # prime
        except psutil.NoSuchProcess:
            pass
    return _seen[p.pid]


def worker_processes() -> list[psutil.Process]:
    """The `main.py` worker and every descendant of it."""
    procs: dict[int, psutil.Process] = {}
    for p in psutil.process_iter(["pid", "cmdline"]):
        cmd = p.info["cmdline"] or []
        if any(part.endswith("main.py") for part in cmd) and "dev" in cmd:
            procs[p.pid] = _track(p)
            try:
                for child in p.children(recursive=True):
                    procs[child.pid] = _track(child)
            except psutil.NoSuchProcess:
                pass
    live = set(procs)
    for pid in list(_seen):
        if pid not in live:
            del _seen[pid]
    return list(procs.values())


def sample() -> tuple[float, float, str, float]:
    """(worker CPU total, busiest single worker process, its name, system CPU)."""
    total, busiest, busiest_name = 0.0, 0.0, "-"
    for p in worker_processes():
        try:
            cpu = p.cpu_percent(interval=None)
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            continue
        total += cpu
        if cpu >= busiest:
            busiest, busiest_name = cpu, f"{p.pid}"
    return total, busiest, busiest_name, psutil.cpu_percent(interval=None)


def latest_call() -> dict | None:
    sql = (
        "select json_build_object('started', extract(epoch from started_at),"
        " 'messages', messages, 'turns', latency->'turnDetails')"
        " from call_log order by started_at desc limit 1"
    )
    try:
        out = subprocess.run(
            ["docker", "exec", PG_CONTAINER, "psql", "-U", "samata", "-d", "samata", "-At", "-c", sql],
            capture_output=True,
            text=True,
            timeout=15,
            check=True,
        ).stdout.strip()
        return json.loads(out) if out else None
    except (subprocess.SubprocessError, json.JSONDecodeError, OSError) as e:
        print(f"(could not read the latest call: {e})")
        return None


def turn_windows(call: dict) -> list[tuple[float, float]]:
    """(user message time, assistant reply time) for direct replies to the user."""
    windows, last_user = [], None
    for m in call.get("messages") or []:
        if m.get("time") is None:
            continue
        if m["role"] == "user":
            last_user = m["time"]
        elif m["role"] == "assistant" and last_user is not None:
            windows.append((last_user, m["time"]))
            last_user = None
        elif m["role"] == "tool":
            last_user = None
    return windows


def main() -> None:
    sys.stdout.reconfigure(line_buffering=True)  # so `| tee file` shows live
    samples: list[tuple[float, float, float, str, float]] = []
    psutil.cpu_percent(interval=None)
    if not worker_processes():
        print("No worker found. Start it first: pnpm worker:dev")
        sys.exit(1)

    print(f"Sampling every {INTERVAL}s. Make your call, hang up, then press Ctrl-C.\n")
    print(f"{'time':>8}  {'worker':>7}  {'busiest':>8}  {'pid':>6}  {'system':>7}")
    try:
        while True:
            time.sleep(INTERVAL)
            total, busiest, pid, system = sample()
            samples.append((time.time(), total, busiest, pid, system))
            print(
                f"{time.strftime('%H:%M:%S'):>8}  {total:6.0f}%  {busiest:7.0f}%  {pid:>6}  {system:6.0f}%"
            )
    except KeyboardInterrupt:
        pass

    if not samples:
        return
    print("\n--- overall ---")
    print(
        f"worker CPU: avg {sum(s[1] for s in samples) / len(samples):.0f}%, "
        f"peak {max(s[1] for s in samples):.0f}%   "
        f"busiest single process peak {max(s[2] for s in samples):.0f}%   "
        f"system peak {max(s[4] for s in samples):.0f}%"
    )

    call = latest_call()
    if not call:
        return
    turns = call.get("turns") or []
    windows = turn_windows(call)
    print("\n--- per turn (latest call; window = your message until the reply) ---")
    print(f"{'turn':>4}  {'LLM ttft':>9}  {'busiest process':>16}  {'system':>7}  {'samples':>7}")
    for i, (start, end) in enumerate(windows):
        inside = [s for s in samples if start - 0.5 <= s[0] <= end + 1.0]
        llm = f"{turns[i]['llmTtft'] * 1000:.0f} ms" if i < len(turns) and len(turns) == len(windows) else "?"
        if not inside:
            print(f"{i + 1:>4}  {llm:>9}  {'(not sampled)':>16}")
            continue
        print(
            f"{i + 1:>4}  {llm:>9}  {max(s[2] for s in inside):>15.0f}%  "
            f"{max(s[4] for s in inside):>6.0f}%  {len(inside):>7}"
        )
    print(
        "\nRead it: a busiest-process figure near 100% on the slow turns means the"
        " worker is CPU-bound. Low figures everywhere mean CPU is not the cause."
    )


if __name__ == "__main__":
    main()
