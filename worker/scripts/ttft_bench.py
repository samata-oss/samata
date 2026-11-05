"""Measure gpt-4.1-mini time-to-first-token the way the worker does, outside LiveKit.

Isolates the model call (same plugin, same client settings, same prewarm) from the
rest of the voice pipeline, so you can tell whether slow LLM first-token times come
from OpenAI/network or from something in the worker.

    cd worker
    OPENAI_API_KEY=sk-... .venv/bin/python scripts/ttft_bench.py [model]

Each row is one simulated call: a brand-new client, prewarmed like AgentSession
does, then 4 turns. Numbers are milliseconds to the first content/tool chunk,
which is how LiveKit (and Vapi) define LLM first token.
"""

from __future__ import annotations

import asyncio
import os
import statistics
import sys
import time

from livekit.agents import llm
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import openai

MODEL = sys.argv[1] if len(sys.argv) > 1 else "gpt-4.1-mini"
KEY = os.environ["OPENAI_API_KEY"]
TURNS = 4
CALLS = 3
QUESTIONS = [
    "Hi, what are your hours today?",
    "Do you have anything open on Saturday?",
    "Great, can I book a table for two?",
    "Thanks, that's all.",
]


async def one_call(*, tools: list, strict: bool) -> list[float]:
    lk = openai.LLM(model=MODEL, api_key=KEY, _strict_tool_schema=strict)
    lk.prewarm()  # what AgentSession does at start
    await asyncio.sleep(1.0)  # greeting plays while the prewarm lands

    ctx = llm.ChatContext.empty()
    ctx.add_message(role="system", content="You are a helpful voice assistant.")
    out: list[float] = []
    for q in QUESTIONS[:TURNS]:
        ctx.add_message(role="user", content=q)
        t0 = time.perf_counter()
        stream = lk.chat(chat_ctx=ctx, tools=tools)
        ttft = None
        text = ""
        async for chunk in stream:
            if chunk.delta and chunk.delta.content:
                text += chunk.delta.content
            if ttft is None and chunk.has_response():
                ttft = time.perf_counter() - t0
        await stream.aclose()
        out.append((ttft or 0) * 1000)
        ctx.add_message(role="assistant", content=text)
        await asyncio.sleep(2.0)  # caller listening / speaking
    await lk.aclose()
    return out


async def variant(label: str, **kw) -> None:
    rows = [await one_call(**kw) for _ in range(CALLS)]
    print(f"\n{label}")
    for i, r in enumerate(rows, 1):
        print(f"  call {i}: " + "  ".join(f"{x:6.0f}" for x in r))
    flat = [x for r in rows for x in r]
    first = [r[0] for r in rows]
    print(f"  mean {statistics.mean(flat):.0f} ms | median {statistics.median(flat):.0f} ms | first turn mean {statistics.mean(first):.0f} ms")


async def main() -> None:
    end_call = EndCallTool(delete_room=True)
    tools = list(end_call.tools)
    print(f"model={MODEL}  (ms to first token; columns are turns 1..{TURNS})")
    await variant("no tools", tools=[], strict=True)
    await variant("end_call tool, strict schema (what the worker does today)", tools=tools, strict=True)
    await variant("end_call tool, non-strict schema", tools=tools, strict=False)


asyncio.run(main())
