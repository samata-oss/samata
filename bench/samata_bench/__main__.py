"""CLI: python -m samata_bench <command>

  setup-trunk      create the LiveKit outbound SIP trunk used to place calls
  gen-utterances   synthesize the caller's scripted lines (OpenAI TTS)
  selftest         measure the speech detector's own timing bias (no calls)
  run              place the calls and write results/<run_id>/turns.csv
  serve            run jobs queued from the dashboard's Benchmarks page
  report           p50/p95 tables from one or more runs
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
import time
from pathlib import Path

import numpy as np


def _load_env() -> None:
    try:
        from dotenv import load_dotenv

        load_dotenv()
    except ImportError:
        pass


# -- setup-trunk ---------------------------------------------------------


async def cmd_setup_trunk(args: argparse.Namespace) -> None:
    from livekit import api

    url, key, secret = (os.environ.get(k, "") for k in (
        "LIVEKIT_URL", "LIVEKIT_API_KEY", "LIVEKIT_API_SECRET"))
    if not (url and key and secret):
        raise SystemExit("Set LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET.")

    info = api.SIPOutboundTrunkInfo(
        name=args.name,
        address=args.address,
        numbers=[args.number],
        auth_username=args.username or "",
        auth_password=args.password or "",
    )
    async with api.LiveKitAPI(url, key, secret) as lkapi:
        trunk = await lkapi.sip.create_outbound_trunk(
            api.CreateSIPOutboundTrunkRequest(trunk=info)
        )
    print(f"Created outbound trunk: {trunk.sip_trunk_id}")
    print(f'Put this in your config:  trunk_id = "{trunk.sip_trunk_id}"')


# -- gen-utterances ------------------------------------------------------


async def cmd_gen_utterances(args: argparse.Namespace) -> None:
    import aiohttp

    from .audio import write_wav

    key = os.environ.get("OPENAI_API_KEY", "")
    if not key:
        raise SystemExit("Set OPENAI_API_KEY to synthesize utterances.")

    lines = [
        ln.strip()
        for ln in Path(args.script).read_text().splitlines()
        if ln.strip() and not ln.startswith("#")
    ]
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    async with aiohttp.ClientSession() as http:
        for i, text in enumerate(lines, start=1):
            async with http.post(
                "https://api.openai.com/v1/audio/speech",
                headers={"Authorization": f"Bearer {key}"},
                json={
                    "model": args.model,
                    "voice": args.voice,
                    "input": text,
                    # Raw 24 kHz, 16-bit, mono PCM.
                    "response_format": "pcm",
                },
            ) as resp:
                if resp.status != 200:
                    raise SystemExit(f"TTS failed ({resp.status}): {await resp.text()}")
                pcm = np.frombuffer(await resp.read(), dtype="<i2")
            path = out / f"{i:02d}.wav"
            write_wav(path, pcm, 24000)
            print(f"{path}  {len(pcm) / 24000:.1f}s  {text}")


# -- selftest ------------------------------------------------------------


def _resample_16k(samples: np.ndarray, sr: int) -> np.ndarray:
    if sr == 16000:
        return samples
    n = int(len(samples) * 16000 / sr)
    x = np.interp(np.linspace(0, len(samples) - 1, n), np.arange(len(samples)), samples)
    return x.astype(np.int16)


async def cmd_selftest(args: argparse.Namespace) -> None:
    """Replay each utterance, in real time, through the detector.

    We know when speech really starts in the file, so detected minus true is
    the detector's own bias. Callee audio goes through the same detector, so
    this offset applies equally to every target.
    """
    from livekit import rtc
    from livekit.plugins import silero

    from .audio import load_utterances
    from .config import DetectorConfig
    from .detector import SpeechDetector

    cfg = DetectorConfig(threshold=args.threshold, onset_windows=args.onset_windows)
    vad = silero.VAD.load(sample_rate=16000)
    utts = load_utterances(args.utterances)
    biases: list[float] = []

    for utt in utts:
        samples = _resample_16k(utt.samples, utt.sample_rate)
        lead = 1.0
        pcm = np.concatenate([np.zeros(int(16000 * lead), dtype=np.int16), samples,
                              np.zeros(16000, dtype=np.int16)])
        loud = np.flatnonzero(np.abs(pcm.astype(np.int32)) > 500)
        true_onset_s = loud[0] / 16000 if loud.size else lead

        det = SpeechDetector(vad, threshold=cfg.threshold, onset_windows=cfg.onset_windows)
        t0 = time.monotonic()
        step = 160
        for i in range(0, len(pcm), step):
            frame = rtc.AudioFrame.create(16000, 1, step)
            chunk = pcm[i : i + step]
            buf = np.frombuffer(frame.data, dtype=np.int16)
            buf[: len(chunk)] = chunk
            if len(chunk) < step:
                buf[len(chunk):] = 0
            det.push_frame(frame)
            delay = t0 + (i + step) / 16000 - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
        await asyncio.sleep(0.3)
        if det.onsets:
            bias = (det.onsets[0] - t0 - true_onset_s) * 1000
            biases.append(bias)
            print(f"{utt.name}: detected {bias:+.0f} ms from true onset")
        else:
            print(f"{utt.name}: no speech detected")
        await det.aclose()

    if biases:
        b = np.asarray(biases)
        print(f"\nDetector bias: mean {b.mean():+.0f} ms, "
              f"range {b.min():+.0f} to {b.max():+.0f} ms over {len(b)} clips")
        print("(Positive = detector reports speech late. Same for every target.)")


# -- run / report --------------------------------------------------------


async def cmd_run(args: argparse.Namespace) -> None:
    from .config import load_config
    from .runner import run_benchmark

    cfg = load_config(args.config)
    out = await run_benchmark(cfg, args.config)
    print(f"\nNext: python -m samata_bench report {out}")


async def cmd_serve(args: argparse.Namespace) -> None:
    from .remote import serve

    await serve(args.config)


def cmd_report(args: argparse.Namespace) -> None:
    from .report import analyze, find_turn_files, load_rows, render_markdown

    result = analyze(load_rows(find_turn_files(args.paths)))
    if args.json:
        print(json.dumps(result, indent=2))
    else:
        print(render_markdown(result))


def main() -> None:
    _load_env()
    p = argparse.ArgumentParser(prog="samata_bench", description=__doc__,
                                formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("setup-trunk", help="create the outbound SIP trunk")
    s.add_argument("--address", required=True, help="carrier SIP host, e.g. sip.telnyx.com")
    s.add_argument("--number", required=True, help="caller ID you own, E.164")
    s.add_argument("--username")
    s.add_argument("--password")
    s.add_argument("--name", default="samata-bench")

    s = sub.add_parser("gen-utterances", help="synthesize caller lines with OpenAI TTS")
    s.add_argument("--script", default="utterances.txt")
    s.add_argument("--out", default="utterances")
    s.add_argument("--model", default="gpt-4o-mini-tts")
    s.add_argument("--voice", default="alloy")

    s = sub.add_parser("selftest", help="measure the detector's own timing bias")
    s.add_argument("--utterances", default="utterances")
    s.add_argument("--threshold", type=float, default=0.5)
    s.add_argument("--onset-windows", type=int, default=3)

    s = sub.add_parser("run", help="place calls and record latencies")
    s.add_argument("--config", default="bench.toml")

    s = sub.add_parser("serve", help="take jobs from the control plane's Benchmarks page")
    s.add_argument("--config", default="bench.toml")

    s = sub.add_parser("report", help="summarize results")
    s.add_argument("paths", nargs="+", help="run directories or turns.csv files")
    s.add_argument("--json", action="store_true")

    args = p.parse_args()
    if args.cmd == "report":
        cmd_report(args)
        return
    handlers = {
        "setup-trunk": cmd_setup_trunk,
        "gen-utterances": cmd_gen_utterances,
        "selftest": cmd_selftest,
        "run": cmd_run,
        "serve": cmd_serve,
    }
    try:
        asyncio.run(handlers[args.cmd](args))
    except KeyboardInterrupt:
        sys.exit(130)


if __name__ == "__main__":
    main()
