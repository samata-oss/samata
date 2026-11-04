import "dotenv/config";
import { db } from "../src/db";
import { agent, tool, toolServer } from "../src/db/schema";
import {
  type AgentConfigInput,
  agentConfigSchema,
} from "../src/lib/agent-config";
import { DEFAULT_ORGANIZATION_ID } from "../src/lib/workspace";

// The example customer server: `pnpm example:webhooks`. Use
// host.docker.internal instead of localhost if the control plane is in Docker.
const exampleServer =
  process.env.SAMATA_EXAMPLE_SERVER_URL ?? "http://localhost:4000";

const config: AgentConfigInput = {
  firstMessage: "Hi, thanks for calling Acme. How can I help you today?",
  model: {
    model: "gpt-4.1-mini",
    systemPrompt: [
      "You are the friendly phone receptionist for Acme, an online store.",
      "Keep replies to one or two short sentences: this is a voice call.",
      "Never use lists, markdown, or emoji.",
      "Use lookup_order_status for order questions, get_store_hours for opening hours and get_current_time for the time.",
    ].join("\n"),
    temperature: 0.6,
  },
  voice: { voiceId: "f786b574-daa5-4673-aa0c-cbe3e8534c02", model: "sonic-3" },
  transcriber: { model: "nova-3", language: "en-US", keyterms: ["Acme"] },
  vad: { activationThreshold: 0.5, minSilenceDuration: 0.3 },
  interruption: { enabled: true, minDuration: 0.5 },
  server: { url: exampleServer, timeoutSeconds: 10 },
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
  ],
  // Library tools: defined once in the workspace, served by the tool server.
  toolNames: ["lookup_order_status", "get_store_hours"],
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

// What the example server pushes on start (`pnpm example:webhooks` with
// SAMATA_API_KEY set). Seeded too so the demo works before it has run.
const libraryTools = [
  {
    name: "lookup_order_status",
    description: "Look up the shipping status of an order.",
    parameters: {
      type: "object",
      properties: { orderNumber: { type: "string" } },
      required: ["orderNumber"],
    },
    messageOnStart: "One moment while I look that up.",
  },
  {
    name: "get_store_hours",
    description: "Get the store's opening hours for a day of the week.",
    parameters: {
      type: "object",
      properties: { day: { type: "string", description: "e.g. Monday" } },
      required: ["day"],
    },
  },
];

async function main() {
  const parsed = agentConfigSchema.parse(config);

  await db
    .insert(toolServer)
    .values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      server: { url: exampleServer, timeoutSeconds: 10 },
    })
    .onConflictDoNothing();
  for (const t of libraryTools) {
    await db
      .insert(tool)
      .values({ organizationId: DEFAULT_ORGANIZATION_ID, ...t })
      .onConflictDoNothing();
  }
  await db
    .insert(agent)
    .values({
      organizationId: DEFAULT_ORGANIZATION_ID,
      slug: "receptionist",
      name: "Acme Receptionist",
      phoneNumber: "+15555550100",
      config: parsed,
    })
    .onConflictDoUpdate({ target: agent.slug, set: { config: parsed } });

  console.log("Seeded agent 'receptionist' in the default workspace.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
