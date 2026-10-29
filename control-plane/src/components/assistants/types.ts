import type { AgentConfig } from "@/lib/agent-config";
import type { CallLatency, CallStatus } from "@/db/schema";

/** What the editor needs to know about a call (a slice of `call_log`). */
export type AssistantCall = {
  id: string;
  startedAt: Date;
  type: string;
  status: CallStatus;
  endedReason: string | null;
  customerNumber: string | null;
  durationSeconds: number | null;
  summary: string | null;
  toolCallCount: number;
  latency: CallLatency | null;
};

/** The editable state of an assistant. `phoneNumber` is "" when unassigned. */
export type Draft = {
  name: string;
  slug: string;
  phoneNumber: string;
  config: AgentConfig;
};

export type UpdateConfig = (fn: (config: AgentConfig) => AgentConfig) => void;
