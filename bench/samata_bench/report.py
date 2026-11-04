from __future__ import annotations

import csv
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np

PERCENTILES = (50, 90, 95, 99)


def find_turn_files(paths: list[str]) -> list[Path]:
    files: list[Path] = []
    for p in map(Path, paths):
        if p.is_dir():
            files.extend(sorted(p.rglob("turns.csv")))
        else:
            files.append(p)
    if not files:
        raise SystemExit("No turns.csv found.")
    return files


def load_rows(files: list[Path]) -> list[dict]:
    rows: list[dict] = []
    for f in files:
        with open(f, newline="") as fh:
            rows.extend(csv.DictReader(fh))
    return rows


def _bootstrap_ci(x: np.ndarray, q: float, n: int = 2000, seed: int = 0):
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, len(x), size=(n, len(x)))
    stats = np.percentile(x[idx], q, axis=1)
    return float(np.percentile(stats, 2.5)), float(np.percentile(stats, 97.5))


def summarize(values: list[float]) -> dict:
    x = np.asarray(values, dtype=float)
    out: dict = {"n": len(x)}
    if len(x) == 0:
        return out
    for q in PERCENTILES:
        out[f"p{q}"] = float(np.percentile(x, q))
    out["mean"] = float(x.mean())
    out["min"] = float(x.min())
    out["max"] = float(x.max())
    if len(x) >= 20:
        out["p50_ci"] = _bootstrap_ci(x, 50)
        out["p95_ci"] = _bootstrap_ci(x, 95)
    return out


def analyze(rows: list[dict]) -> dict:
    """Per target: steady-state turns (turn_idx > 0), first turns, and drops."""
    steady: dict[str, list[float]] = defaultdict(list)
    first: dict[str, list[float]] = defaultdict(list)
    dropped: dict[str, Counter] = defaultdict(Counter)
    total: Counter = Counter()

    for r in rows:
        if r["warmup"] == "1":
            continue
        t = r["target"]
        total[t] += 1
        if r["valid"] != "1" or not r["latency_ms"]:
            dropped[t][r["invalid_reason"] or "invalid"] += 1
            continue
        (first if r["turn_idx"] == "0" else steady)[t].append(float(r["latency_ms"]))

    targets = sorted(total)
    return {
        t: {
            "turns": total[t],
            "steady": summarize(steady[t]),
            "first": summarize(first[t]),
            "dropped": dict(dropped[t]),
        }
        for t in targets
    }


def _ms(v: float | None) -> str:
    return "-" if v is None else f"{v:,.0f}"


def _cell(s: dict, key: str) -> str:
    if key not in s:
        return "-"
    val = _ms(s[key])
    ci = s.get(f"{key}_ci")
    return f"{val} ({_ms(ci[0])}-{_ms(ci[1])})" if ci else val


def render_markdown(result: dict) -> str:
    lines: list[str] = []
    for label, key in (("Steady-state turns (turn 2+)", "steady"), ("First turn", "first")):
        lines.append(f"### {label} - latency in ms\n")
        lines.append("| Target | n | p50 (95% CI) | p90 | p95 (95% CI) | p99 | mean | max |")
        lines.append("|---|---:|---|---:|---|---:|---:|---:|")
        for t, d in result.items():
            s = d[key]
            lines.append(
                f"| {t} | {s['n']} | {_cell(s, 'p50')} | {_ms(s.get('p90'))} | "
                f"{_cell(s, 'p95')} | {_ms(s.get('p99'))} | {_ms(s.get('mean'))} | "
                f"{_ms(s.get('max'))} |"
            )
        lines.append("")

    lines.append("### Dropped turns\n")
    lines.append("| Target | turns | dropped | reasons |")
    lines.append("|---|---:|---:|---|")
    for t, d in result.items():
        n_drop = sum(d["dropped"].values())
        reasons = ", ".join(f"{k}: {v}" for k, v in sorted(d["dropped"].items())) or "-"
        lines.append(f"| {t} | {d['turns']} | {n_drop} | {reasons} |")
    lines.append(
        "\nLatency = first speech on the callee's audio minus the moment our last "
        "audio sample finished playing out. CIs are bootstrap, shown when n >= 20."
    )
    return "\n".join(lines)
