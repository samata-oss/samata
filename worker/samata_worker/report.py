"""Turn an AgentSession's history into an end-of-call-report payload."""

from __future__ import annotations

import math
from typing import Any

from livekit.agents import AgentSession, CloseReason

# CloseReason -> Vapi-style endedReason.
ENDED_REASONS = {
    CloseReason.PARTICIPANT_DISCONNECTED: "customer-ended-call",
    CloseReason.USER_INITIATED: "assistant-ended-call",
    CloseReason.TASK_COMPLETED: "assistant-ended-call",
    CloseReason.JOB_SHUTDOWN: "worker-shutdown",
    CloseReason.ERROR: "error",
}


def _avg(xs: list[float]) -> float | None:
    return sum(xs) / len(xs) if xs else None


def _p95(xs: list[float]) -> float | None:
    if not xs:
        return None
    s = sorted(xs)
    return s[min(len(s) - 1, math.ceil(0.95 * len(s)) - 1)]


def build_report(
    session: AgentSession,
    *,
    call_id: str,
    started_at: float,
    ended_at: float,
    ended_reason: str,
) -> dict[str, Any]:
    messages: list[dict[str, Any]] = []
    eot, stt, ttft, ttfb, v2v = [], [], [], [], []
    turn_details: list[dict[str, float]] = []
    pending_eot: float | None = None
    pending_stt: float | None = None
    tool_calls = 0

    for item in session.history.items:
        if item.type == "message":
            text = item.text_content or ""
            if item.role not in ("user", "assistant") or not text:
                continue
            messages.append(
                {
                    "role": item.role,
                    "content": text,
                    "time": item.created_at,
                    "interrupted": item.interrupted,
                }
            )
            m = item.metrics
            if item.role == "user":
                # Reset so a turn missing a metric never inherits the last one.
                pending_stt = None
                if "end_of_turn_delay" in m:
                    pending_eot = m["end_of_turn_delay"]
                    eot.append(pending_eot)
                if "transcription_delay" in m:
                    pending_stt = m["transcription_delay"]
                    stt.append(pending_stt)
            elif "llm_node_ttft" in m:
                ttft.append(m["llm_node_ttft"])
                if "tts_node_ttfb" in m:
                    ttfb.append(m["tts_node_ttfb"])
                    # Voice-to-voice only for direct replies to a measured
                    # user turn (not the greeting or a post-tool reply).
                    if pending_eot is not None:
                        total = pending_eot + m["llm_node_ttft"] + m["tts_node_ttfb"]
                        v2v.append(total)
                        turn_details.append(
                            {
                                "endOfTurn": pending_eot,
                                **(
                                    {"transcription": pending_stt}
                                    if pending_stt is not None
                                    else {}
                                ),
                                "llmTtft": m["llm_node_ttft"],
                                "ttsTtfb": m["tts_node_ttfb"],
                                "total": total,
                            }
                        )
                pending_eot = None
                pending_stt = None
        elif item.type == "function_call":
            tool_calls += 1
            # The reply after a tool includes tool time; don't count it.
            pending_eot = None
            pending_stt = None
        elif item.type == "function_call_output":
            messages.append(
                {
                    "role": "tool",
                    "toolName": item.name,
                    "content": item.output,
                    "time": item.created_at,
                }
            )

    transcript = "\n".join(
        f"{'User' if m['role'] == 'user' else 'AI'}: {m['content']}"
        for m in messages
        if m["role"] in ("user", "assistant")
    )
    latency = {
        "turns": len(v2v),
        "endOfTurnDelayAvg": _avg(eot),
        "transcriptionDelayAvg": _avg(stt),
        "llmTtftAvg": _avg(ttft),
        "ttsTtfbAvg": _avg(ttfb),
        "voiceToVoiceAvg": _avg(v2v),
        "voiceToVoiceP95": _p95(v2v),
        # One entry per measured turn, in call order (seconds).
        "turnDetails": turn_details,
    }
    return {
        "type": "end-of-call-report",
        "call": {"id": call_id},
        "endedReason": ended_reason,
        "startedAt": started_at,
        "endedAt": ended_at,
        "transcript": transcript,
        "messages": messages,
        "latency": {k: v for k, v in latency.items() if v is not None},
        "usage": [u.model_dump(mode="json") for u in session.usage.model_usage],
        "toolCallCount": tool_calls,
    }
