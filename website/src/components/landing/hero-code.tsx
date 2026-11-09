import { CodeTabs, type CodeTab } from "@/components/landing/code-tabs";
import { highlight } from "fumadocs-core/highlight";

/** `PUT /api/agents`: an agent is one JSON file, pushed over HTTP. */
const agentJson = `// PUT /api/agents
{
  "name": "Support",
  "slug": "support",
  "config": {
    "firstMessage": "Hi! How can I help?",
    "model": {
      "provider": "openai",
      "model": "gpt-4.1-mini",
      "systemPrompt": "You are a support agent."
    },
    "toolNames": ["lookup_order_status"]
  }
}`;

/** The server you run: Samata POSTs here when the model calls a tool. */
const toolServer = `import { Hono } from "hono";

const app = new Hono();

// Samata POSTs every call event to this one url.
app.post("/", async (c) => {
  const { message } = await c.req.json();

  if (message.type === "tool-calls") {
    const results = message.toolCallList.map((tc) => ({
      toolCallId: tc.id,
      result: \`Order \${tc.arguments.orderNumber} ships Friday.\`,
    }));
    return c.json({ results });
  }

  return c.json({});
});`;

const snippets: { id: string; label: string; lang: string; code: string }[] = [
  { id: "agent", label: "agent.json", lang: "jsonc", code: agentJson },
  { id: "tools", label: "server.ts", lang: "ts", code: toolServer },
];

/**
 * What you write: the agent as JSON, and the HTTP server its tools call. It sits
 * beside the dashboard screenshot, which shows what you get. Highlighting runs
 * on the server, so no highlighter ships to the browser.
 */
export async function HeroCode({ className }: { className?: string }) {
  const tabs: CodeTab[] = await Promise.all(
    snippets.map(async ({ id, label, lang, code }) => ({
      id,
      label,
      content: await highlight(code, { lang, theme: "github-dark-default" }),
    })),
  );

  return <CodeTabs tabs={tabs} className={className} />;
}
