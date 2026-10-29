# Samata

An open-source, self-hosted, declarative voice AI orchestrator: a Vapi
alternative you run yourself.

Samata keeps real-time media separate from agent logic:

```
 PSTN / SIP ──► LiveKit SIP ─┐
                             ├─► LiveKit Server (Go SFU) ◄──► Python worker(s)
 Browser (WebRTC) ───────────┘        │  Redis                (livekit-agents,
                                      │                        stateless)
                                      ▼                            │
                              Next.js control plane ◄── webhooks ──┘
                              (agents, call logs, tools)   Postgres
```

- **LiveKit Server** carries the audio (WebRTC and SIP) and dispatches rooms to workers.
- **The worker** (`/worker`) stores nothing about any agent. For each call it asks
  the control plane for the agent's config, builds the Deepgram → OpenAI → Cartesia
  pipeline from it, and reports back when the call ends.
- **The control plane** (`/control-plane`, Next.js + Hono + Drizzle) stores agent
  configs and call logs, runs tools, and does post-call analysis.

## Deploying Samata

You don't need to clone or fork the repo to run Samata. Every release ships
two images to GHCR, and `deploy/docker-compose.yml` runs the whole stack from
prebuilt images:

| Image                                | What it is                                                  |
| ------------------------------------ | ----------------------------------------------------------- |
| `ghcr.io/<org>/samata-control-plane` | Next.js control plane. Applies database migrations on boot. |
| `ghcr.io/<org>/samata-worker`        | Stateless livekit-agents worker. Scale it horizontally.     |

On a server with ports 80, 443, 7881/tcp and 7882/udp open, and DNS records
for two hostnames pointing at it:

```bash
mkdir samata && cd samata
curl -O https://raw.githubusercontent.com/<org>/samata/main/deploy/docker-compose.yml
curl -o .env https://raw.githubusercontent.com/<org>/samata/main/deploy/.env.example
$EDITOR .env            # domains, secrets, provider keys
docker compose up -d
```

This starts Caddy (automatic TLS), the control plane, the worker, LiveKit,
Redis and Postgres. Add `--profile sip` for phone calls, and
`--scale worker=N` for more concurrent calls.

Your own logic doesn't go in this repo. Agents are JSON you send to the API,
and your tools and post-call handling run on your own servers, which Samata
calls through each tool's `server.url` and the agent's `server.url`.

**LiveKit Cloud:** the worker and control plane only need `LIVEKIT_URL` and
API keys. To use LiveKit Cloud, delete the `livekit` and `sip` services and
point the env at your project. Running the media layer yourself (public IPs,
UDP, TURN) is the hardest part of self-hosting, so this is a reasonable
starting point.

**Releases:** `.github/workflows/images.yml` builds both images for amd64 and
arm64 on every PR. Pushes to the default branch publish `:edge`, and `v*` tags
publish `:X.Y.Z`, `:X.Y` and `:latest`. To pin a release, set `SAMATA_VERSION`.

## Developing Samata

```bash
# 1. Infra: LiveKit, Redis, Postgres
docker compose up -d livekit redis postgres

# 2. Control plane
pnpm install
cp control-plane/.env.example control-plane/.env
pnpm db:migrate && pnpm db:seed
pnpm dev                                    # http://localhost:3000

# 3. Try the webhook lifecycle without any audio
pnpm simulate:call

# 4. Worker (add your OPENAI / DEEPGRAM / CARTESIA keys to worker/.env)
cd worker
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
cp .env.example .env
.venv/bin/python main.py dev
```

To talk to the agent from a browser, get a token and paste the URL and token into
<https://agents-playground.livekit.io>:

```bash
curl -X POST -H "authorization: Bearer dev-api-key-change-me" \
  localhost:3000/api/agents/receptionist/test-token
```

To run the worker as a container instead (it doesn't need the rest of the stack
to build):

```bash
docker build -t samata-worker ./worker
docker compose --profile worker up -d worker
```

## Call lifecycle

The worker talks to the control plane with Vapi-style `{ "message": { "type", ... } }`
envelopes. Every request carries `x-samata-secret: $SAMATA_WEBHOOK_SECRET`.

| Webhook                                 | When                       | Control plane does                                                                                                                                                           |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/webhooks/assistant-request`  | A participant joins a room | Picks the agent, opens a `call_log` row, returns `{ call: { id }, assistant }`. Returns `{ error }` with 404 to reject the call, and the worker then hangs up.               |
| `POST /api/webhooks/tool-calls`         | The LLM calls a tool       | Runs a built-in tool or forwards it to the tool's `server.url`, then returns `{ results: [{ toolCallId, result \| error }] }`.                                               |
| `POST /api/webhooks/end-of-call-report` | The room closes            | Saves the transcript, messages, latency and usage. After responding, it runs the summary and structured-data extraction and forwards the report to the agent's `server.url`. |

**Choosing the agent** (`assistant-request`), in order:
1. `agentId` (an id or a slug) from the dispatch metadata or the room metadata
2. The dialed number (`sip.trunkPhoneNumber`), matched against `agent.phone_number`
3. `SAMATA_DEFAULT_AGENT`

Lifecycle events (`call.started`, `call.tool-calls`, `call.ended`, `call.analyzed`)
are published on the Redis channel `samata:events` and streamed as SSE from
`GET /api/calls/events`.

## Agent config

Agents are declarative JSON. The schema is `control-plane/src/lib/agent-config.ts`,
and the worker mirrors it in `worker/samata_worker/config.py`. To create or replace
an agent by slug:

```bash
curl -X PUT localhost:3000/api/agents \
  -H "authorization: Bearer dev-api-key-change-me" -H "content-type: application/json" \
  -d '{
    "slug": "support", "name": "Support", "phoneNumber": "+14155550100",
    "config": {
      "firstMessage": "Hi! How can I help?",
      "model": { "model": "gpt-4.1-mini", "systemPrompt": "You are a concise support agent." },
      "voice": { "voiceId": "f786b574-daa5-4673-aa0c-cbe3e8534c02" },
      "vad": { "activationThreshold": 0.6 },
      "interruption": { "enabled": true, "minDuration": 0.4 },
      "tools": [{
        "name": "lookup_order_status",
        "description": "Look up an order.",
        "parameters": { "type": "object", "properties": { "orderNumber": { "type": "string" } } },
        "server": { "url": "https://example.com/tools" }
      }],
      "analysisPlan": { "structuredDataSchema": { "type": "object", "properties": { "intent": { "type": "string" } } } },
      "server": { "url": "https://example.com/samata-events" }
    }
  }'
```

Any field you leave out gets a default. Barge-in is on by default; the
`interruption` block tunes it. `server` URLs and secrets are never sent to the
worker.

## Phone calls (SIP)

```bash
docker compose --profile sip up -d
```

Create an inbound trunk, then a dispatch rule that sends calls to the
`samata` agent, using the [`lk` CLI](https://docs.livekit.io/sip/). The worker
reads `sip.trunkPhoneNumber` and `sip.phoneNumber` from the caller's participant
attributes.

## Layout

```
docker-compose.yml        Dev infra: LiveKit, LiveKit SIP (profile), Redis, Postgres, worker (profile)
deploy/                   Production compose (prebuilt images + Caddy) and .env.example
infra/livekit/            Dev livekit.yaml, sip.yaml (dev keys: devkey / samata_dev_secret_…)
control-plane/            Next.js 16, Hono under /api, Drizzle (agent, call_log), Dockerfile
worker/                   livekit-agents 1.8 worker, Dockerfile
.github/workflows/        Multi-arch image builds, published to GHCR
```

> The keys in `infra/livekit/*.yaml` and `.env.example` are development
> placeholders. Rotate all of them before you expose anything.
