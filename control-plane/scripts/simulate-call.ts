/**
 * Drive the whole webhook lifecycle without LiveKit: what the worker does on
 * a real call, as plain HTTP. Needs `pnpm dev` and `pnpm db:seed`.
 *
 *   pnpm simulate:call [agent-slug]
 */
import "dotenv/config";

const base = process.env.SAMATA_PUBLIC_URL ?? "http://localhost:3000";
const secret = process.env.SAMATA_WEBHOOK_SECRET ?? "";

async function post(path: string, message: Record<string, unknown>) {
  const res = await fetch(`${base}/api/webhooks/${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-samata-secret": secret },
    body: JSON.stringify({ message }),
  });
  const body = await res.json();
  console.log(
    `\nPOST ${path} -> ${res.status}\n`,
    JSON.stringify(body, null, 2),
  );
  if (!res.ok) process.exit(1);
  return body;
}

async function main() {
  const agentSlug = process.argv[2];
  const startedAt = Date.now() / 1000;

  // 1. Inbound SIP call to the seeded agent's number (or by slug if given).
  const { call } = await post("assistant-request", {
    type: "assistant-request",
    call: {
      roomName: `sim-${Math.random().toString(36).slice(2, 8)}`,
      type: "inbound",
      ...(agentSlug && { agentId: agentSlug }),
    },
    phoneNumber: { number: "+15555550100" },
    customer: { number: "+14155550123" },
  });

  // 2. The LLM calls a forwarded tool and a built-in one.
  await post("tool-calls", {
    type: "tool-calls",
    call: { id: call.id },
    toolCallList: [
      {
        id: "tc_1",
        name: "lookup_order_status",
        arguments: { orderNumber: "A1234" },
      },
      { id: "tc_2", name: "get_current_time", arguments: {} },
    ],
  });

  // 3. The room closes.
  const messages = [
    {
      role: "assistant",
      content: "Hi, thanks for calling Acme. How can I help you today?",
    },
    { role: "user", content: "Where is my order A1234?" },
    {
      role: "tool",
      toolName: "lookup_order_status",
      content: "Order A1234 shipped yesterday and arrives Friday.",
    },
    {
      role: "assistant",
      content: "Order A1234 shipped yesterday and should arrive Friday.",
    },
    { role: "user", content: "Great, thanks. Bye!" },
  ];
  await post("end-of-call-report", {
    type: "end-of-call-report",
    call: { id: call.id },
    endedReason: "customer-ended-call",
    startedAt,
    endedAt: startedAt + 42,
    messages,
    transcript: messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .map((m) => `${m.role === "user" ? "User" : "AI"}: ${m.content}`)
      .join("\n"),
    latency: {
      turns: 2,
      llmTtftAvg: 0.31,
      ttsTtfbAvg: 0.14,
      endOfTurnDelayAvg: 0.52,
      fromTransportAvg: 0.01,
      toTransportAvg: 0.01,
      voiceToVoiceAvg: 0.99,
      turnDetails: [
        {
          endOfTurn: 0.5,
          transcription: 0.2,
          llmTtft: 0.3,
          ttsTtfb: 0.13,
          fromTransport: 0.01,
          toTransport: 0.01,
          total: 0.95,
        },
        {
          endOfTurn: 0.54,
          transcription: 0.25,
          llmTtft: 0.32,
          ttsTtfb: 0.15,
          fromTransport: 0.01,
          toTransport: 0.01,
          total: 1.03,
        },
      ],
    },
    toolCallCount: 2,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
