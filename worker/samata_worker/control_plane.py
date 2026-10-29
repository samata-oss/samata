"""HTTP client for the control plane's Vapi-style webhooks."""

from __future__ import annotations

import logging
import os
from typing import Any

import aiohttp

logger = logging.getLogger("samata.control_plane")


class AssistantRejected(Exception):
    """The control plane has no agent for this call (or refused it)."""


class ControlPlane:
    def __init__(self, http: aiohttp.ClientSession) -> None:
        self._http = http
        self._base = os.environ.get("SAMATA_CONTROL_PLANE_URL", "http://localhost:3000").rstrip("/")
        self._headers = {"x-samata-secret": os.environ.get("SAMATA_WEBHOOK_SECRET", "")}

    async def _post(self, path: str, message: dict[str, Any], timeout: float) -> tuple[int, dict]:
        async with self._http.post(
            f"{self._base}/api/webhooks/{path}",
            json={"message": message},
            headers=self._headers,
            timeout=aiohttp.ClientTimeout(total=timeout),
        ) as res:
            body = await res.json(content_type=None)
            return res.status, body or {}

    async def assistant_request(
        self,
        *,
        room_name: str,
        call_type: str,
        agent_id: str | None,
        metadata: dict[str, Any],
        dialed_number: str | None,
        customer_number: str | None,
    ) -> tuple[str, dict[str, Any]]:
        """Returns (call_id, assistant config dict)."""
        message: dict[str, Any] = {
            "type": "assistant-request",
            "call": {"roomName": room_name, "type": call_type, "metadata": metadata},
        }
        if agent_id:
            message["call"]["agentId"] = agent_id
        if dialed_number:
            message["phoneNumber"] = {"number": dialed_number}
        if customer_number:
            message["customer"] = {"number": customer_number}

        status, body = await self._post("assistant-request", message, timeout=10)
        if status != 200 or "assistant" not in body:
            raise AssistantRejected(body.get("error") or f"HTTP {status}")
        return body["call"]["id"], body["assistant"]

    async def tool_call(
        self, *, call_id: str, tool_call_id: str, name: str, arguments: dict[str, Any]
    ) -> dict[str, Any]:
        """Returns `{ result }` or `{ error }` for a single tool call."""
        status, body = await self._post(
            "tool-calls",
            {
                "type": "tool-calls",
                "call": {"id": call_id},
                "toolCallList": [{"id": tool_call_id, "name": name, "arguments": arguments}],
            },
            timeout=30,
        )
        if status != 200:
            return {"error": body.get("error") or f"HTTP {status}"}
        for r in body.get("results", []):
            if r.get("toolCallId") == tool_call_id:
                return r
        return {"error": "No result for this tool call."}

    async def end_of_call_report(self, report: dict[str, Any]) -> None:
        status, body = await self._post("end-of-call-report", report, timeout=15)
        if status != 200:
            logger.error("end-of-call-report rejected: %s %s", status, body)
