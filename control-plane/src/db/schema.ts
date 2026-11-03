import { randomUUID } from "node:crypto";
import { relations } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import type { AgentConfig } from "@/lib/agent-config";
import { organization } from "./auth-schema";

// Better Auth's tables (user, session, organization, member, ...). The
// drizzle adapter reads them from this module.
export * from "./auth-schema";

/**
 * A declarative voice agent. Everything about how a call behaves lives in
 * `config` (validated by `agentConfigSchema`), so the worker stays stateless.
 */
export const agent = pgTable(
  "agent",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /** The workspace that owns this agent. Every query is scoped by it. */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    /**
     * Human-friendly id, usable in room metadata / dispatch instead of `id`.
     * Unique across the install, because the worker resolves it without
     * knowing the workspace. Dispatch by `id` where that could be ambiguous.
     */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /**
     * E.164 number that routes inbound SIP calls to this agent (matched against
     * the `sip.trunkPhoneNumber` participant attribute). Null for web-only agents.
     * Unique across the install: a dialed number maps to exactly one agent.
     */
    phoneNumber: text("phone_number").unique(),
    config: jsonb("config").$type<AgentConfig>().notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [index("agent_organization_idx").on(table.organizationId)],
);

export const PHONE_PROVIDERS = ["telnyx"] as const;
export type PhoneProvider = (typeof PHONE_PROVIDERS)[number];

/**
 * What was created so that calls to an imported number reach Samata, kept so
 * it can be torn down again. Null until the number is connected.
 */
export type NumberRouting = {
  /** `SAMATA_SIP_HOST` when connected. A different value means it is stale. */
  host: string;
  livekit: { trunkId: string; dispatchRuleId: string };
  telnyx: {
    /** The Telnyx SIP connection that delivers the number's calls to `host`. */
    connectionId: string;
    kind: "fqdn" | "ip";
    /** The FQDN or IP entry on that connection. */
    endpointId: string;
    /** What the number pointed at before; restored on disconnect. */
    previousConnectionId: string | null;
  };
};

/**
 * A number a workspace has imported from a telephony provider. This is the
 * inventory only: which assistant answers it is `agent.phoneNumber`, the
 * column inbound routing already reads, so there is one source of truth for
 * assignment.
 */
export const importedNumber = pgTable(
  "phone_number",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    provider: text("provider").$type<PhoneProvider>().notNull(),
    /**
     * E.164. Unique across the install, like `agent.phoneNumber`: a dialed
     * number belongs to exactly one workspace.
     */
    number: text("number").notNull().unique(),
    /** The provider's id for this number (Telnyx phone number id). */
    providerNumberId: text("provider_number_id"),
    /**
     * The provider API key, encrypted (`server/secrets.ts`). Never sent to the
     * browser.
     */
    encryptedApiKey: text("encrypted_api_key").notNull(),
    routing: jsonb("routing").$type<NumberRouting>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [index("phone_number_organization_idx").on(table.organizationId)],
);

export const CALL_STATUSES = ["in-progress", "ended", "failed"] as const;
export type CallStatus = (typeof CALL_STATUSES)[number];

/** One transcript entry, as reported by the worker. */
export type CallMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  /** Seconds since epoch. */
  time?: number;
  interrupted?: boolean;
  toolName?: string;
};

/** Per-turn latencies (seconds) as averaged by the worker. */
export type CallLatency = {
  turns: number;
  /** End of user speech -> end-of-turn decision. */
  endOfTurnDelayAvg?: number;
  transcriptionDelayAvg?: number;
  llmTtftAvg?: number;
  ttsTtfbAvg?: number;
  /** Rough voice-to-voice: end-of-turn + LLM TTFT + TTS TTFB. */
  voiceToVoiceAvg?: number;
  voiceToVoiceP95?: number;
};

/**
 * One row per call. Created on assistant-request (status `in-progress`) and
 * completed by the end-of-call-report.
 */
export const callLog = pgTable(
  "call_log",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => randomUUID()),
    /**
     * Copied from the agent when the call starts. It outlives the agent
     * (`agentId` is set null when an agent is deleted), so a deleted agent's
     * calls stay in the right workspace instead of becoming visible to all.
     */
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    agentId: text("agent_id").references(() => agent.id, {
      onDelete: "set null",
    }),
    roomName: text("room_name").notNull(),
    /** "inbound" | "outbound" | "web" */
    type: text("type").notNull().default("web"),
    customerNumber: text("customer_number"),
    status: text("status").$type<CallStatus>().notNull().default("in-progress"),
    endedReason: text("ended_reason"),
    startedAt: timestamp("started_at").defaultNow().notNull(),
    endedAt: timestamp("ended_at"),
    durationSeconds: real("duration_seconds"),
    transcript: text("transcript"),
    messages: jsonb("messages").$type<CallMessage[]>(),
    latency: jsonb("latency").$type<CallLatency>(),
    /** Raw model usage from livekit-agents (tokens, characters, audio secs). */
    usage: jsonb("usage").$type<Record<string, unknown>[]>(),
    summary: text("summary"),
    structuredData: jsonb("structured_data").$type<Record<string, unknown>>(),
    analysisError: text("analysis_error"),
    toolCallCount: integer("tool_call_count").notNull().default(0),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index("call_log_agent_idx").on(table.agentId),
    index("call_log_started_at_idx").on(table.startedAt),
    index("call_log_organization_started_idx").on(
      table.organizationId,
      table.startedAt,
    ),
  ],
);

export const agentRelations = relations(agent, ({ many }) => ({
  calls: many(callLog),
}));

export const callLogRelations = relations(callLog, ({ one }) => ({
  agent: one(agent, { fields: [callLog.agentId], references: [agent.id] }),
}));
