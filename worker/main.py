"""Samata worker: a stateless LiveKit agent driven by the control plane.

Every call is configured at runtime. When a room is dispatched to this
worker it asks the control plane (assistant-request) which agent to run,
builds the STT -> LLM -> TTS pipeline from the returned JSON, routes tool
calls back through the control plane, and posts an end-of-call-report when
the room closes. Nothing about any particular agent lives in this process.

    python main.py dev     # local development, hot reload
    python main.py start   # production
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from typing import Any

import aiohttp
from dotenv import load_dotenv
from livekit import api, rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    CloseEvent,
    ConversationItemAddedEvent,
    JobContext,
    JobProcess,
    RunContext,
    ToolError,
    cli,
    function_tool,
)
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import silero

from samata_worker.config import AssistantConfig, ToolConfig, VadConfig
from samata_worker.control_plane import AssistantRejected, ControlPlane
from samata_worker.providers import ProviderError, build_llm, build_stt, build_tts
from samata_worker.report import ENDED_REASONS, build_report
from samata_worker.transport import RttSampler

load_dotenv()
logger = logging.getLogger("samata.worker")

# Explicit dispatch: rooms (web tokens, SIP dispatch rules) must request this name.
AGENT_NAME = os.environ.get("SAMATA_AGENT_NAME", "samata")



def prewarm(proc: JobProcess) -> None:
    # Loading Silero takes a moment, so do it once per process. Agents with
    # non-default VAD settings get their own instance per call.
    proc.userdata["vad"] = _load_vad(VadConfig())


server = AgentServer(setup_fnc=prewarm)


def _json(raw: str | None) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _load_vad(cfg: VadConfig):
    return silero.VAD.load(
        activation_threshold=cfg.activation_threshold,
        min_speech_duration=cfg.min_speech_duration,
        min_silence_duration=cfg.min_silence_duration,
    )


def _vad_for(ctx: JobContext, cfg: VadConfig):
    if cfg == VadConfig():
        return ctx.proc.userdata["vad"]
    return _load_vad(cfg)


def _remote_tool(spec: ToolConfig, cp: ControlPlane, call_id: str):
    """An LLM tool whose implementation lives behind the tool-calls webhook."""

    async def handler(raw_arguments: dict[str, object], context: RunContext) -> str:
        if spec.message_on_start:
            context.session.say(spec.message_on_start, add_to_chat_ctx=False)
        res = await cp.tool_call(
            call_id=call_id,
            tool_call_id=context.function_call.call_id,
            name=spec.name,
            arguments=dict(raw_arguments),
        )
        if "error" in res:
            raise ToolError(str(res["error"]))
        return str(res.get("result", ""))

    return function_tool(
        handler,
        raw_schema={
            "name": spec.name,
            "description": spec.description,
            "parameters": spec.parameters,
        },
    )


class SamataAgent(Agent):
    def __init__(self, config: AssistantConfig, tools: list, *, greet: bool = True) -> None:
        super().__init__(instructions=config.model.system_prompt, tools=tools)
        self._first_message = config.first_message
        self._greet = greet

    async def on_enter(self) -> None:
        # Like Vapi: speak the first message if set, otherwise wait for the caller.
        # Outbound calls hold it until the customer answers (`greet=False`).
        if self._greet and self._first_message:
            self.session.say(self._first_message)


def _build_session(ctx: JobContext, config: AssistantConfig) -> AgentSession:
    i, e, p = config.interruption, config.endpointing, config.preemptive_generation

    return AgentSession(
        stt=build_stt(config.transcriber),
        llm=build_llm(config.model),
        tts=build_tts(config.voice),
        vad=_vad_for(ctx, config.vad),
        # Barge-in: the caller talking over the agent cuts it off. Brief
        # noises (< min_duration) are ignored, and if a "false" interruption
        # is followed by silence the agent resumes where it stopped.
        turn_handling={
            "interruption": {
                "enabled": i.enabled,
                "min_duration": i.min_duration,
                "min_words": i.min_words,
                "resume_false_interruption": i.resume_false_interruption,
            },
            "endpointing": {"min_delay": e.min_delay, "max_delay": e.max_delay},
            # Start the LLM (and optionally TTS) on the final transcript,
            # before the turn is confirmed, to hide the endpointing delay.
            "preemptive_generation": {
                "enabled": p.enabled,
                "preemptive_tts": p.tts,
            },
        },
    )


async def _watch_loop_lag(threshold: float = 0.1, interval: float = 0.05) -> None:
    """Warn when something blocks this process's event loop for over `threshold`."""
    last = time.perf_counter()
    while True:
        await asyncio.sleep(interval)
        now = time.perf_counter()
        lag = now - last - interval
        last = now
        if lag > threshold:
            logger.warning("event loop blocked for %.0fms", lag * 1000)


def _trace_llm_timing(session: AgentSession) -> None:
    """Log each turn's LLM first-token time measured two ways.

    - `request`: the HTTP call alone, clocked around the plugin's stream. This is
      what the model provider took to answer.
    - `node`: what the dashboard shows (`llm_node_ttft`), clocked from the moment
      the pipeline invokes the LLM node. It also covers the worker's own work
      before the request goes out (context and tool schemas) and any delay in
      the event loop.

    Each logs on its own line (a turn can make several requests, or cancel a
    preemptive one). If the numbers agree, the time is in the provider call or
    the network. If `node` is much larger, it is inside this process.
    """
    def on_request(m) -> None:
        if m.ttft >= 0:
            logger.info(
                "llm ttft: request=%.0fms prompt_tokens=%d cached=%d cancelled=%s id=%s",
                m.ttft * 1000,
                m.prompt_tokens,
                m.prompt_cached_tokens,
                m.cancelled,
                m.request_id,
            )

    def on_item(ev: ConversationItemAddedEvent) -> None:
        item = ev.item
        if item.type != "message" or item.role != "assistant":
            return
        node = item.metrics.get("llm_node_ttft")
        if node is not None:
            logger.info("llm ttft: node=%.0fms (shown on dashboard)", node * 1000)

    if session.llm is not None:
        session.llm.on("metrics_collected", on_request)
    session.on("conversation_item_added", on_item)

    # A blocked event loop inflates both numbers above equally, so watch for it.
    lag_task = asyncio.get_running_loop().create_task(_watch_loop_lag())
    session.on("close", lambda _ev: lag_task.cancel())


class DialTarget:
    """An outbound call to place, as the control plane set it in the job metadata."""

    def __init__(self, to_number: str, trunk_id: str, from_number: str | None) -> None:
        self.to_number = to_number
        self.trunk_id = trunk_id
        self.from_number = from_number

    @classmethod
    def from_metadata(cls, meta: dict[str, Any]) -> "DialTarget | None":
        if meta.get("callType") != "outbound":
            return None
        to_number, trunk_id = meta.get("dialTo"), meta.get("trunkId")
        if not isinstance(to_number, str) or not isinstance(trunk_id, str):
            return None
        from_number = meta.get("fromNumber")
        return cls(to_number, trunk_id, from_number if isinstance(from_number, str) else None)


def _dial_failure_reason(err: api.TwirpError) -> str:
    """Map LiveKit's SIP failure to an endedReason, by the SIP status the far end sent."""
    status = str((err.metadata or {}).get("sip_status_code", ""))
    if status in ("486", "600"):
        return "customer-busy"
    if status in ("480", "408", "487"):
        return "customer-did-not-answer"
    if status == "603":
        return "customer-declined"
    return "dial-failed"


async def _dial(ctx: JobContext, target: DialTarget, identity: str) -> None:
    """Ring the customer through the trunk and return once they answer.

    Raises `api.TwirpError` if the call isn't answered (busy, no answer, declined,
    or the trunk or carrier refused it).
    """
    await ctx.api.sip.create_sip_participant(
        api.CreateSIPParticipantRequest(
            room_name=ctx.room.name,
            sip_trunk_id=target.trunk_id,
            sip_call_to=target.to_number,
            participant_identity=identity,
            participant_name=target.to_number,
            wait_until_answered=True,
        )
    )


async def _abort_call(
    ctx: JobContext,
    cp: ControlPlane,
    http: aiohttp.ClientSession,
    *,
    call_id: str,
    started_at: float,
    reason: str,
    shutdown_reason: str,
) -> None:
    """End a call that never got going: report it, so it isn't left "in progress"."""
    try:
        await cp.end_of_call_report(
            {
                "type": "end-of-call-report",
                "call": {"id": call_id},
                "endedReason": reason,
                "startedAt": started_at,
                "endedAt": time.time(),
            }
        )
    except Exception:
        logger.exception("failed to report failed call %s", call_id)
    finally:
        await http.close()
        # Deleting the room hangs up a phone leg instead of leaving dead air.
        await ctx.delete_room()
        ctx.shutdown(reason=shutdown_reason)


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    job_meta = _json(ctx.job.metadata)
    room_meta = _json(ctx.room.metadata)

    # An outbound call (placed through the API) has nobody to wait for: we ring
    # the customer ourselves once the pipeline is ready. Inbound and browser
    # calls start when the caller joins.
    dial = DialTarget.from_metadata(job_meta)
    participant = None if dial else await ctx.wait_for_participant()
    started_at = time.time()

    # Routing hints: explicit agent id from dispatch or room metadata, else
    # the dialed number on inbound SIP.
    is_sip = participant is not None and participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
    attrs = participant.attributes if participant else {}

    http = aiohttp.ClientSession()
    cp = ControlPlane(http)
    try:
        call_id, raw_config = await cp.assistant_request(
            room_name=ctx.room.name,
            call_type=job_meta.get("callType") or ("inbound" if is_sip else "web"),
            agent_id=job_meta.get("agentId") or room_meta.get("agentId"),
            call_id=job_meta.get("callId"),
            metadata={**room_meta, **job_meta},
            dialed_number=attrs.get("sip.trunkPhoneNumber") or (dial.from_number if dial else None),
            customer_number=attrs.get("sip.phoneNumber") or (dial.to_number if dial else None),
        )
    except (AssistantRejected, aiohttp.ClientError, asyncio.TimeoutError) as err:
        logger.warning("no assistant for room %s: %s", ctx.room.name, err)
        await http.close()
        # Deleting the room hangs up SIP callers instead of leaving dead air.
        await ctx.delete_room()
        ctx.shutdown(reason="assistant-request-failed")
        return

    config = AssistantConfig.from_dict(raw_config)
    ctx.log_context_fields = {"call_id": call_id, "agent_id": config.id}
    logger.info("starting call %s with agent %s", call_id, config.name)

    tools: list = [_remote_tool(t, cp, call_id) for t in config.tools]
    if config.end_call_enabled:
        tools.append(EndCallTool(delete_room=True))

    try:
        session = _build_session(ctx, config)
    except Exception as err:
        # A provider we can't build (unknown id, key rejected by the plugin).
        # Don't leave the caller in dead air and the call "in progress".
        if isinstance(err, ProviderError):
            logger.error("call %s cannot start: %s", call_id, err)
        else:
            logger.exception("call %s cannot start", call_id)
        await _abort_call(
            ctx,
            cp,
            http,
            call_id=call_id,
            started_at=started_at,
            reason="error",
            shutdown_reason="provider-config-error",
        )
        return

    _trace_llm_timing(session)
    ended_reason: str | None = None

    @session.on("close")
    def _on_close(ev: CloseEvent) -> None:
        nonlocal ended_reason
        ended_reason = ended_reason or ENDED_REASONS.get(ev.reason, str(ev.reason))
        if ev.error:
            logger.error("session closed with error: %s", ev.error)
        # The session ending (caller hung up, end_call tool) ends the job.
        ctx.shutdown(reason=ended_reason)

    async def enforce_max_duration() -> None:
        nonlocal ended_reason
        await asyncio.sleep(config.max_duration_seconds)
        ended_reason = "exceeded-max-duration"
        await session.say(
            "I'm sorry, we've reached the time limit for this call. Goodbye!",
            allow_interruptions=False,
        )
        session.shutdown()

    rtt_sampler = RttSampler(ctx.room)
    timer: asyncio.Task | None = None

    def begin_call() -> None:
        """The conversation is live: start the clock, the time limit and the report."""
        nonlocal timer
        timer = asyncio.create_task(enforce_max_duration())
        rtt_sampler.start()
        ctx.add_shutdown_callback(send_report)

    async def send_report() -> None:
        if timer:
            timer.cancel()
        rtt_sampler.stop()
        try:
            # Make sure the history is final if the job ended first.
            await session.aclose()
            report = build_report(
                session,
                call_id=call_id,
                started_at=started_at,
                ended_at=time.time(),
                ended_reason=ended_reason or "worker-shutdown",
                rtt_samples=rtt_sampler.samples(),
            )
            await cp.end_of_call_report(report)
        except Exception:
            logger.exception("failed to send end-of-call-report for %s", call_id)
        finally:
            await http.close()

    if dial is None:
        begin_call()
        await session.start(agent=SamataAgent(config, tools), room=ctx.room)
        return

    # Outbound: have the agent ready, ring the customer, and speak only once
    # they pick up. The report callback is registered after the answer, so a
    # call that never connects is reported by `_abort_call` instead.
    session_started = asyncio.create_task(
        session.start(agent=SamataAgent(config, tools, greet=False), room=ctx.room)
    )
    logger.info("call %s dialing %s", call_id, dial.to_number)
    try:
        await _dial(ctx, dial, identity=f"phone-{call_id[:8]}")
    except api.TwirpError as err:
        reason = _dial_failure_reason(err)
        logger.warning("call %s to %s not connected (%s): %s", call_id, dial.to_number, reason, err.message)
        session_started.cancel()
        now = time.time()
        await _abort_call(
            ctx,
            cp,
            http,
            call_id=call_id,
            started_at=now,
            reason=reason,
            shutdown_reason=reason,
        )
        return

    await session_started
    # Talk time starts at the answer, not at the first ring.
    started_at = time.time()
    begin_call()
    if config.first_message:
        session.say(config.first_message)


if __name__ == "__main__":
    cli.run_app(server)
