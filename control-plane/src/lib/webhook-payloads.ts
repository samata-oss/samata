import { z } from "zod";

/**
 * Payloads the worker POSTs to the control plane. They mirror Vapi's server
 * message envelope (`{ message: { type, call, ... } }`) so existing Vapi
 * webhook handlers port over with minimal changes.
 */

const phone = z.object({ number: z.string() }).optional();

export const assistantRequestSchema = z.object({
  message: z.object({
    type: z.literal("assistant-request"),
    call: z.object({
      roomName: z.string().min(1),
      type: z.enum(["inbound", "outbound", "web"]).default("web"),
      /** Agent id or slug, from dispatch / room metadata. */
      agentId: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }),
    /** The number that was dialed (SIP `sip.trunkPhoneNumber`). */
    phoneNumber: phone,
    /** The caller (SIP `sip.phoneNumber`). */
    customer: phone,
  }),
});

export const toolCallsSchema = z.object({
  message: z.object({
    type: z.literal("tool-calls"),
    call: z.object({ id: z.string() }),
    toolCallList: z
      .array(
        z.object({
          id: z.string(),
          name: z.string(),
          arguments: z.record(z.string(), z.unknown()).default({}),
        }),
      )
      .min(1),
  }),
});

const callMessageSchema = z.object({
  role: z.enum(["system", "user", "assistant", "tool"]),
  content: z.string(),
  time: z.number().optional(),
  interrupted: z.boolean().optional(),
  toolName: z.string().optional(),
});

export const endOfCallReportSchema = z.object({
  message: z.object({
    type: z.literal("end-of-call-report"),
    call: z.object({ id: z.string() }),
    endedReason: z.string().default("unknown"),
    /** Seconds since epoch. */
    startedAt: z.number(),
    endedAt: z.number(),
    transcript: z.string().default(""),
    messages: z.array(callMessageSchema).default([]),
    latency: z
      .object({
        turns: z.number().int(),
        endOfTurnDelayAvg: z.number().optional(),
        transcriptionDelayAvg: z.number().optional(),
        llmTtftAvg: z.number().optional(),
        ttsTtfbAvg: z.number().optional(),
        overlapAvg: z.number().optional(),
        voiceToVoiceAvg: z.number().optional(),
        voiceToVoiceP95: z.number().optional(),
        turnDetails: z
          .array(
            z.object({
              endOfTurn: z.number(),
              transcription: z.number().optional(),
              llmTtft: z.number(),
              ttsTtfb: z.number(),
              overlap: z.number().optional(),
              total: z.number(),
            }),
          )
          .optional(),
      })
      .default({ turns: 0 }),
    usage: z.array(z.record(z.string(), z.unknown())).default([]),
    toolCallCount: z.number().int().default(0),
  }),
});

export type AssistantRequest = z.infer<typeof assistantRequestSchema>;
export type ToolCallsRequest = z.infer<typeof toolCallsSchema>;
export type ToolCall = ToolCallsRequest["message"]["toolCallList"][number];
export type EndOfCallReport = z.infer<typeof endOfCallReportSchema>;
