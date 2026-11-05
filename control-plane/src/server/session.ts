import { randomUUID } from "node:crypto";
import {
  AccessToken,
  AgentDispatchClient,
  RoomServiceClient,
} from "livekit-server-sdk";
import { db } from "@/db";
import { agent } from "@/db/schema";
import { agentConfigSchema } from "@/lib/agent-config";
import { inWorkspace } from "@/server/agents";
import { MissingKeysError, resolveCredentials } from "@/server/provider-keys";

/** Must match AGENT_NAME in the worker. */
export const WORKER_AGENT_NAME =
  process.env.SAMATA_WORKER_AGENT_NAME ?? "samata";

/** How long the browser has to use its token before it expires. */
const TOKEN_TTL = "10m";
/** A room nobody joined is reaped by LiveKit after this many seconds. */
const ROOM_EMPTY_TIMEOUT_S = 60;

export type StartedSession = {
  /** The SFU the browser connects to (`wss://...`). */
  url: string;
  /** Room-scoped JWT. It can join `roomName` and nothing else. */
  token: string;
  roomName: string;
};

export class SessionError extends Error {
  constructor(
    readonly status: 404 | 422 | 500 | 502,
    message: string,
  ) {
    super(message);
  }
}

function livekit() {
  const {
    LIVEKIT_URL: url,
    LIVEKIT_API_KEY: key,
    LIVEKIT_API_SECRET: secret,
  } = process.env;
  if (!url || !key || !secret) {
    throw new SessionError(
      500,
      "LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set.",
    );
  }
  return { url, key, secret };
}

/**
 * Start a browser voice session for an assistant (id or slug) in a workspace.
 *
 *   1. Load the assistant (404 if it doesn't exist in that workspace).
 *   2. Create a uniquely named room on the SFU.
 *   3. Explicitly dispatch the Samata worker into it, server-side, with the
 *      assistant id as job metadata. The browser never sees or influences it.
 *   4. Mint a short-lived token that can only join that one room.
 *
 * The already-running worker picks the job up and asks the control plane for
 * the assistant's full config (`/api/webhooks/assistant-request`), the same
 * path SIP calls take. Nothing here needs LIVEKIT_API_SECRET in the browser.
 */
export async function startSession(
  assistantRef: string,
  organizationId: string,
): Promise<StartedSession> {
  const [row] = await db
    .select({ id: agent.id, config: agent.config })
    .from(agent)
    .where(inWorkspace(organizationId, assistantRef));
  if (!row) throw new SessionError(404, "Assistant not found.");

  // Fail here, where the person testing sees why, rather than after the
  // worker joins and finds it can't authenticate with a provider.
  try {
    await resolveCredentials(
      organizationId,
      agentConfigSchema.parse(row.config),
    );
  } catch (err) {
    if (err instanceof MissingKeysError)
      throw new SessionError(422, err.message);
    throw err;
  }

  const { url, key, secret } = livekit();
  const roomName = `call_${randomUUID().replaceAll("-", "").slice(0, 12)}`;

  const rooms = new RoomServiceClient(url, key, secret);
  const dispatches = new AgentDispatchClient(url, key, secret);

  try {
    await rooms.createRoom({
      name: roomName,
      emptyTimeout: ROOM_EMPTY_TIMEOUT_S,
      // The caller and the agent.
      maxParticipants: 2,
    });
    await dispatches.createDispatch(roomName, WORKER_AGENT_NAME, {
      metadata: JSON.stringify({ agentId: row.id, callType: "web" }),
    });
  } catch (err) {
    console.error("[session] could not create/dispatch room", roomName, err);
    // Don't leave an orphan room behind; ignore failures here.
    await rooms.deleteRoom(roomName).catch(() => {});
    throw new SessionError(502, "Could not reach the LiveKit server.");
  }

  const token = new AccessToken(key, secret, {
    identity: `user-${randomUUID().slice(0, 8)}`,
    ttl: TOKEN_TTL,
  });
  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return { url, token: await token.toJwt(), roomName };
}
