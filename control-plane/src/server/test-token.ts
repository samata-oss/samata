import { randomUUID } from "node:crypto";
import {
  AccessToken,
  RoomAgentDispatch,
  RoomConfiguration,
} from "livekit-server-sdk";

/** Must match AGENT_NAME in the worker. */
const WORKER_AGENT_NAME = process.env.SAMATA_WORKER_AGENT_NAME ?? "samata";

/**
 * A short-lived browser token for talking to an agent over WebRTC. Joining the
 * room dispatches the Samata worker with `{ agentId }` as job metadata.
 */
export async function mintTestToken(agentId: string) {
  const roomName = `web-${randomUUID().slice(0, 8)}`;
  const token = new AccessToken(
    process.env.LIVEKIT_API_KEY,
    process.env.LIVEKIT_API_SECRET,
    { identity: `tester-${randomUUID().slice(0, 6)}`, ttl: "15m" },
  );
  token.addGrant({ roomJoin: true, room: roomName });
  token.roomConfig = new RoomConfiguration({
    agents: [
      new RoomAgentDispatch({
        agentName: WORKER_AGENT_NAME,
        metadata: JSON.stringify({ agentId }),
      }),
    ],
  });
  return {
    url: process.env.LIVEKIT_URL,
    roomName,
    token: await token.toJwt(),
  };
}
