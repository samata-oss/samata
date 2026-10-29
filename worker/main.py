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
from livekit import rtc
from livekit.agents import (
    Agent,
    AgentServer,
    AgentSession,
    CloseEvent,
    JobContext,
    JobProcess,
    RunContext,
    ToolError,
    cli,
    function_tool,
)
from livekit.agents.beta.tools import EndCallTool
from livekit.plugins import cartesia, deepgram, openai, silero

from samata_worker.config import AssistantConfig, ToolConfig, VadConfig
from samata_worker.control_plane import AssistantRejected, ControlPlane
from samata_worker.report import ENDED_REASONS, build_report

load_dotenv()
logger = logging.getLogger("samata.worker")

# Explicit dispatch: rooms (web tokens, SIP dispatch rules) must request this name.
AGENT_NAME = os.environ.get("SAMATA_AGENT_NAME", "samata")



def prewarm(proc: JobProcess) -> None:
    # Loading Silero takes a moment, so do it once per process. Agents with
    # non-default VAD settings get their own instance per call.
    proc.userdata["vad"] = silero.VAD.load()


server = AgentServer(setup_fnc=prewarm)


def _json(raw: str | None) -> dict[str, Any]:
    try:
        value = json.loads(raw) if raw else {}
    except json.JSONDecodeError:
        return {}
    return value if isinstance(value, dict) else {}


def _vad_for(ctx: JobContext, cfg: VadConfig):
    if cfg == VadConfig():
        return ctx.proc.userdata["vad"]
    return silero.VAD.load(
        activation_threshold=cfg.activation_threshold,
        min_speech_duration=cfg.min_speech_duration,
        min_silence_duration=cfg.min_silence_duration,
    )


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
    def __init__(self, config: AssistantConfig, tools: list) -> None:
        super().__init__(instructions=config.model.system_prompt, tools=tools)
        self._first_message = config.first_message

    async def on_enter(self) -> None:
        # Like Vapi: speak the first message if set, otherwise wait for the caller.
        if self._first_message:
            self.session.say(self._first_message)


def _build_session(ctx: JobContext, config: AssistantConfig) -> AgentSession:
    m, v, t, i, e = (
        config.model,
        config.voice,
        config.transcriber,
        config.interruption,
        config.endpointing,
    )
    llm_kwargs: dict[str, Any] = {"model": m.model}
    if m.temperature is not None:
        llm_kwargs["temperature"] = m.temperature
    if m.base_url:
        llm_kwargs["base_url"] = m.base_url

    stt_kwargs: dict[str, Any] = {"model": t.model, "language": t.language}
    if t.keyterms:
        stt_kwargs["keyterm"] = list(t.keyterms)

    return AgentSession(
        stt=deepgram.STT(**stt_kwargs),
        llm=openai.LLM(**llm_kwargs),
        tts=cartesia.TTS(model=v.model, voice=v.voice_id, language=v.language, speed=v.speed),
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
        },
    )


@server.rtc_session(agent_name=AGENT_NAME)
async def entrypoint(ctx: JobContext) -> None:
    await ctx.connect()
    participant = await ctx.wait_for_participant()
    started_at = time.time()

    # Routing hints: explicit agent id from dispatch or room metadata, else
    # the dialed number on inbound SIP.
    job_meta = _json(ctx.job.metadata)
    room_meta = _json(ctx.room.metadata)
    is_sip = participant.kind == rtc.ParticipantKind.PARTICIPANT_KIND_SIP
    attrs = participant.attributes

    http = aiohttp.ClientSession()
    cp = ControlPlane(http)
    try:
        call_id, raw_config = await cp.assistant_request(
            room_name=ctx.room.name,
            call_type=job_meta.get("callType") or ("inbound" if is_sip else "web"),
            agent_id=job_meta.get("agentId") or room_meta.get("agentId"),
            metadata={**room_meta, **job_meta},
            dialed_number=attrs.get("sip.trunkPhoneNumber"),
            customer_number=attrs.get("sip.phoneNumber"),
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

    session = _build_session(ctx, config)
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

    timer = asyncio.create_task(enforce_max_duration())

    async def send_report() -> None:
        timer.cancel()
        try:
            # Make sure the history is final if the job ended first.
            await session.aclose()
            report = build_report(
                session,
                call_id=call_id,
                started_at=started_at,
                ended_at=time.time(),
                ended_reason=ended_reason or "worker-shutdown",
            )
            await cp.end_of_call_report(report)
        except Exception:
            logger.exception("failed to send end-of-call-report for %s", call_id)
        finally:
            await http.close()

    ctx.add_shutdown_callback(send_report)

    await session.start(agent=SamataAgent(config, tools), room=ctx.room)


if __name__ == "__main__":
    cli.run_app(server)
