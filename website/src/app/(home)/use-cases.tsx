import { ServerCodeBlock } from "fumadocs-ui/components/codeblock.rsc";
import type { UseCase } from "@/components/landing/use-case-tabs";

/* Example agents for the editor tabs on the landing page. */

/** Code pane for the editor: no title bar of its own, the tab is the title. */
async function code(lang: string, source: string) {
  return (
    <ServerCodeBlock
      lang={lang}
      code={source}
      codeblock={{
        className:
          "my-0 rounded-none border-0 [&_button]:rounded-none bg-transparent",
      }}
    />
  );
}

export async function buildUseCases(): Promise<UseCase[]> {
  return [
    {
      file: "receptionist.json",
      who: "Receptionists",
      can: "Answer calls and look up orders",
      code: await code(
        "json",
        `{
  "slug": "receptionist",
  "name": "Receptionist",
  "phoneNumber": "+14155550100",
  "config": {
    "firstMessage": "Thanks for calling Acme. How can I help?",
    "model": {
      "model": "gpt-4.1-mini",
      "systemPrompt": "You are Acme's phone receptionist. Keep replies short."
    },
    "toolNames": ["lookup_order_status", "get_store_hours"],
    "analysisPlan": {
      "structuredDataSchema": {
        "type": "object",
        "properties": { "intent": { "type": "string" } }
      }
    }
  }
}`,
      ),
      transcript: [
        {
          t: "00:00",
          role: "agent",
          text: "Thanks for calling Acme. How can I help?",
        },
        { t: "00:03", role: "caller", text: "Hi, where's my order A1234?" },
        {
          t: "00:05",
          role: "tool",
          name: "lookup_order_status",
          args: 'orderNumber: "A1234"',
          result: "Shipped, arrives Friday",
        },
        {
          t: "00:06",
          role: "agent",
          text: "Order A1234 has shipped and arrives Friday.",
        },
      ],
      output: [
        ["intent", "order-status"],
        ["orderNumber", "A1234"],
      ],
    },
    {
      file: "support.json",
      who: "Support",
      can: "Triage issues and open tickets",
      code: await code(
        "json",
        `{
  "slug": "support",
  "name": "Support",
  "config": {
    "firstMessage": "Support line. What's going on?",
    "model": {
      "provider": "openrouter",
      "model": "anthropic/claude-sonnet-4.5",
      "systemPrompt": "Triage the problem, then open a ticket."
    },
    "toolNames": ["lookup_account", "create_ticket"],
    "endCallEnabled": true,
    "server": { "url": "https://example.com/samata-events" }
  }
}`,
      ),
      transcript: [
        { t: "00:00", role: "agent", text: "Support line. What's going on?" },
        {
          t: "00:03",
          role: "caller",
          text: "Checkout is failing for all our users.",
        },
        {
          t: "00:06",
          role: "tool",
          name: "create_ticket",
          args: 'severity: "high"',
          result: "Ticket SUP-482 created",
        },
        {
          t: "00:07",
          role: "agent",
          text: "I've opened SUP-482 as high priority. An engineer will call you back.",
        },
      ],
      output: [
        ["issue", "checkout-failure"],
        ["severity", "high"],
      ],
    },
    {
      file: "sales.json",
      who: "Sales",
      can: "Qualify every inbound lead",
      code: await code(
        "json",
        `{
  "slug": "sales",
  "name": "Sales",
  "config": {
    "firstMessage": "Hi, thanks for your interest. What are you building?",
    "model": {
      "provider": "groq",
      "systemPrompt": "Qualify the lead: company, team size, use case."
    },
    "voice": { "provider": "elevenlabs", "voiceId": "hpp4J3VqNfWAUOO0d1Us" },
    "toolNames": ["add_to_crm"],
    "analysisPlan": {
      "structuredDataSchema": { "type": "object" }
    }
  }
}`,
      ),
      transcript: [
        {
          t: "00:00",
          role: "agent",
          text: "Hi, thanks for your interest. What are you building?",
        },
        {
          t: "00:04",
          role: "caller",
          text: "We're a 40 person logistics company. We want to automate dispatch calls.",
        },
        {
          t: "00:08",
          role: "tool",
          name: "add_to_crm",
          args: 'company: "…"',
          result: "Lead L-2291 created",
        },
        {
          t: "00:09",
          role: "agent",
          text: "Great fit. I'll have someone reach out today.",
        },
      ],
      output: [
        ["teamSize", "40"],
        ["useCase", "dispatch"],
      ],
    },
    {
      file: "scheduler.json",
      who: "Schedulers",
      can: "Book appointments on your calendar",
      code: await code(
        "json",
        `{
  "slug": "scheduler",
  "name": "Scheduler",
  "config": {
    "firstMessage": "Hi! Would you like to book a visit?",
    "model": { "systemPrompt": "Offer open slots and book one." },
    "toolNames": ["check_availability", "book_appointment"],
    "maxDurationSeconds": 300,
    "interruption": { "enabled": true, "minDuration": 0.4 }
  }
}`,
      ),
      transcript: [
        {
          t: "00:00",
          role: "agent",
          text: "Hi! Would you like to book a visit?",
        },
        {
          t: "00:02",
          role: "caller",
          text: "Yes, anything Thursday afternoon?",
        },
        {
          t: "00:04",
          role: "tool",
          name: "check_availability",
          args: 'day: "thu"',
          result: "2:00 pm, 3:30 pm",
        },
        {
          t: "00:05",
          role: "agent",
          text: "I have 2:00 or 3:30. Which works?",
        },
      ],
      output: [
        ["day", "Thursday"],
        ["status", "pending"],
      ],
    },
    {
      file: "quickstart.sh",
      shell: true,
      who: "You",
      can: "Be on a call in a few minutes",
      code: await code(
        "bash",
        `git clone https://github.com/samata-oss/samata.git
cd samata
docker compose up -d livekit postgres

pnpm install
cp control-plane/.env.example control-plane/.env
pnpm db:migrate && pnpm db:seed
pnpm dev                       # http://localhost:3000

# in another terminal
cd worker && python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env && .venv/bin/python main.py dev`,
      ),
      transcript: [
        {
          t: "00:00",
          role: "agent",
          text: "Hi, thanks for calling Acme. How can I help you today?",
        },
        {
          t: "00:03",
          role: "caller",
          text: "Is this actually running on your laptop?",
        },
        { t: "00:05", role: "agent", text: "It is. Pretty neat, right?" },
      ],
      output: [
        ["agent", "receptionist"],
        ["type", "web"],
      ],
    },
  ];
}
