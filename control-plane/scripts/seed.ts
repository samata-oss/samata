import "dotenv/config";
import { db } from "../src/db";
import { agent } from "../src/db/schema";
import {
  type AgentConfigInput,
  agentConfigSchema,
} from "../src/lib/agent-config";

const baseUrl = process.env.SAMATA_PUBLIC_URL ?? "http://localhost:3000";

const config: AgentConfigInput = {
  firstMessage: "Hi, thanks for calling Acme. How can I help you today?",
  model: {
    model: "gpt-4.1-mini",
    systemPrompt: [
      "You are the friendly phone receptionist for Acme, an online store.",
      "Keep replies to one or two short sentences: this is a voice call.",
      "Never use lists, markdown, or emoji.",
      "Use lookup_order_status for order questions and get_current_time for the time.",
    ].join("\n"),
    temperature: 0.6,
  },
  voice: { voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02", model: "sonic-3" },
  transcriber: { model: "nova-3", language: "en-US", keyterms: ["Acme"] },
  vad: { activationThreshold: 0.5, minSilenceDuration: 0.55 },
  interruption: { enabled: true, minDuration: 0.5 },
  tools: [
    {
      name: "get_current_time",
      description: "Get the current date and time.",
      parameters: {
        type: "object",
        properties: {
          timezone: { type: "string", description: "IANA timezone name." },
        },
      },
    },
    {
      name: "lookup_order_status",
      description: "Look up the shipping status of an order.",
      parameters: {
        type: "object",
        properties: { orderNumber: { type: "string" } },
        required: ["orderNumber"],
      },
      messageOnStart: "One moment while I look that up.",
      server: { url: `${baseUrl}/api/examples/order-status` },
    },
  ],
  analysisPlan: {
    structuredDataSchema: {
      type: "object",
      properties: {
        intent: { type: "string" },
        orderNumber: { type: ["string", "null"] },
        resolved: { type: "boolean" },
      },
      required: ["intent", "orderNumber", "resolved"],
    },
  },
};

async function main() {
  const parsed = agentConfigSchema.parse(config);
  await db
    .insert(agent)
    .values({
      slug: "receptionist",
      name: "Acme Receptionist",
      phoneNumber: "+15555550100",
      config: parsed,
    })
    .onConflictDoUpdate({ target: agent.slug, set: { config: parsed } });

  console.log("Seeded agent 'receptionist'.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
