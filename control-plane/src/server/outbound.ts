import { randomUUID } from "node:crypto";
import { AgentDispatchClient, RoomServiceClient } from "livekit-server-sdk";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { importedNumber } from "@/db/schema";
import { ensureOutbound } from "@/server/numbers";
import {
  livekit,
  prepareCall,
  SessionError,
  WORKER_AGENT_NAME,
} from "@/server/session";

/** E.164: a "+", a country code that doesn't start with 0, up to 15 digits. */
export const E164 = /^\+[1-9]\d{6,14}$/;

/** A room nobody joined is reaped by LiveKit after this many seconds. */
const ROOM_EMPTY_TIMEOUT_S = 60;

export type StartedOutboundCall = {
  /** The call's id. Its log row appears once the worker picks the call up. */
  id: string;
  roomName: string;
  type: "outbound";
  status: "queued";
  agentId: string;
  /** The imported number the call is placed from (the caller ID). */
  fromNumber: string;
  customerNumber: string;
};

/**
 * Place an outbound phone call from an assistant to `customerNumber`.
 *
 *   1. Check the assistant, the plan and the provider keys, like a browser
 *      call (`prepareCall`).
 *   2. Pick the imported number to call from: `phoneNumberId`, else the number
 *      assigned to the assistant. Its owner's Telnyx account pays for the call.
 *   3. Make sure that number can dial out (`ensureOutbound`).
 *   4. Create a room and dispatch the worker into it. The job metadata says
 *      who to dial and through which trunk.
 *
 * The worker does the dialing: it starts its pipeline first, then asks LiveKit
 * to ring the customer and waits for an answer, so the assistant is ready the
 * moment someone picks up and an unanswered call is reported with a reason.
 * That is why this returns as soon as the call is queued.
 *
 * `id` is minted here and handed to the worker, which opens the call's log row
 * under it on assistant-request.
 */
export async function startOutboundCall(
  input: {
    assistantRef: string;
    customerNumber: string;
    phoneNumberId?: string;
  },
  organizationId: string,
): Promise<StartedOutboundCall> {
  const customerNumber = input.customerNumber.trim();
  if (!E164.test(customerNumber)) {
    throw new SessionError(
      400,
      "customer.number must be in E.164 format, like +14155550123.",
    );
  }

  const assistant = await prepareCall(input.assistantRef, organizationId);

  const [from] = await db
    .select()
    .from(importedNumber)
    .where(
      and(
        eq(importedNumber.organizationId, organizationId),
        input.phoneNumberId
          ? eq(importedNumber.id, input.phoneNumberId)
          : eq(importedNumber.number, assistant.phoneNumber ?? ""),
      ),
    );
  if (!from) {
    throw input.phoneNumberId
      ? new SessionError(404, "Phone number not found.")
      : new SessionError(
          422,
          "This assistant has no phone number to call from. Pass phoneNumberId, or assign it an imported number.",
        );
  }

  const outbound = await ensureOutbound(from);
  if (!outbound.ok) throw new SessionError(502, outbound.error);

  const { url, key, secret } = livekit();
  const id = randomUUID();
  const roomName = `call_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const rooms = new RoomServiceClient(url, key, secret);
  const dispatches = new AgentDispatchClient(url, key, secret);

  try {
    await rooms.createRoom({
      name: roomName,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_S,
      // The customer and the agent.
      maxParticipants: 2,
    });
    await dispatches.createDispatch(roomName, WORKER_AGENT_NAME, {
      metadata: JSON.stringify({
        agentId: assistant.id,
        callType: "outbound",
        callId: id,
        dialTo: customerNumber,
        trunkId: outbound.trunkId,
        fromNumber: from.number,
      }),
    });
  } catch (err) {
    console.error("[outbound] could not create/dispatch room", roomName, err);
    await rooms.deleteRoom(roomName).catch(() => {});
    throw new SessionError(502, "Could not reach the LiveKit server.");
  }

  return {
    id,
    roomName,
    type: "outbound",
    status: "queued",
    agentId: assistant.id,
    fromNumber: from.number,
    customerNumber,
  };
}
