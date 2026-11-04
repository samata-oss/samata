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
Redis, Postgres and the SIP server for phone calls (open 5060/tcp+udp and
10000-10100/udp too). Add `--scale worker=N` for more concurrent calls.

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

To talk to the agent from a browser, start a session. This creates the room,
dispatches the worker into it, and returns a room-scoped token. Paste the url and
token into <https://agents-playground.livekit.io>:

```bash
curl -X POST localhost:3000/api/session/start \
  -H "authorization: Bearer dev-api-key-change-me" \
  -H "content-type: application/json" \
  -d '{"assistantId": "receptionist"}'
# -> { "url": "ws://localhost:7880", "token": "...", "roomName": "call_ab12cd34ef56" }
```

To run the worker as a container instead (it doesn't need the rest of the stack
to build):

```bash
docker build -t samata-worker ./worker
docker compose --profile worker up -d worker
```

## Dashboard

The control plane serves a dashboard at `/` (built on the shadcn `sidebar-07`
block), modeled on Vapi's:

| Page               | What it shows                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| Assistants         | Edit an agent's model, voice, transcriber, prompt, tools, VAD and analysis plan. Talk to it from the browser. |
| Tools              | The tool server, the workspace tool library (pushed from code), and which assistants use each tool.           |
| Phone Numbers      | Import a number from Telnyx (API key + number), then assign it to any assistant.                              |
| Logs               | Every call, with transcript, summary, structured data and latency.                                            |
| Structured Outputs | Data extracted by each assistant's analysis plan.                                                             |
| Metrics            | Call volume and the latency breakdown (end of turn, STT, LLM, TTS).                                           |
| API Keys           | Which keys are configured, and the management API and webhook endpoints.                                      |
| Team               | Who is in the workspace. Invite people, remove them.                                                          |

Webhook secrets stored on an agent are never sent to the browser; leave a secret
field empty to keep the stored value.

### Accounts and workspaces

The dashboard has real accounts (email and password, plus optional Google),
built on [Better Auth](https://better-auth.com).

- **The first account becomes the owner.** Sign up as soon as you deploy,
  because whoever gets there first owns the install.
- **After that, sign-up is invitation-only.** Samata spends your Deepgram,
  OpenAI and Cartesia keys on every call, so open registration would let anyone
  on the internet run up your bill. Invite people from **Team**. Samata doesn't
  send email, so creating an invitation gives you a link to share; the link is
  what lets them create their account.
- **Everything belongs to a workspace.** Assistants and call logs carry an
  `organization_id`, and every dashboard and API query is scoped to it. A fresh
  install, or an upgrade, has a single `default` workspace holding all existing
  data. Creating more workspaces and managing teams across them is intentionally
  not in this repo (planned for `ee/`).

Set `BETTER_AUTH_SECRET` (`openssl rand -hex 32`) and, in production,
`BETTER_AUTH_URL` (the compose file derives it from `SAMATA_DOMAIN`). For Google
sign-in set `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`, with the redirect URI
`https://<your-domain>/api/auth/callback/google`.

The management API (`/api/agents`, `/api/calls`, `/api/session/start`) takes
`Authorization: Bearer <key>`. Create keys on the dashboard's **API Keys** page
(owners and admins; the secret, `smt_…`, is shown once and only its hash is
stored). A key acts on its own workspace and can be revoked there. The
`SAMATA_API_KEY` environment variable still works as a key for the default
workspace. The dashboard calls the same API with its session cookie, except
`/api/tools` and `/api/tool-server`, which accept only an API key.

## Starting a browser call

The browser never talks to LiveKit's API and never holds `LIVEKIT_API_SECRET`.

```
Browser ── POST /api/session/start { assistantId } ──► Control plane
   ▲                                                     │ 1. load the assistant
   │◄──────────── { url, token, roomName } ──────────────┤ 2. create room "call_…"
   │                                                     │ 3. dispatch the worker (agentId in metadata)
   │                                                     ▼ 4. mint a token for that room only
   └── WebRTC (token) ──► LiveKit SFU ──job──► pre-warmed worker ──assistant-request──► Control plane
```

The worker process is already running and registered with the SFU, so a call
costs a job assignment, not a container start. The dispatch is created
server-side, so the browser can't change which agent runs. Inbound SIP calls
use the same dispatch to the same worker; only the dispatch rule differs.

## Call lifecycle

The worker talks to the control plane with Vapi-style `{ "message": { "type", ... } }`
envelopes. Every request carries `x-samata-secret: $SAMATA_WEBHOOK_SECRET`.

| Webhook                                 | When                       | Control plane does                                                                                                                                                           |
| --------------------------------------- | -------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/webhooks/assistant-request`  | A participant joins a room | Picks the agent, opens a `call_log` row, returns `{ call: { id }, assistant }`. Returns `{ error }` with 404 to reject the call, and the worker then hangs up.               |
| `POST /api/webhooks/tool-calls`         | The LLM calls a tool       | Runs a built-in tool or forwards it to your [tool server](#tools-and-your-webhook-server), then returns `{ results: [{ toolCallId, result \| error }] }`.                    |
| `POST /api/webhooks/end-of-call-report` | The room closes            | Saves the transcript, messages, latency and usage. After responding, it runs the summary and structured-data extraction and forwards the report to the agent's `server.url`. |

**Choosing the agent** (`assistant-request`), in order:
1. `agentId` (an id or a slug) from the dispatch metadata or the room metadata
2. The dialed number (`sip.trunkPhoneNumber`), matched against `agent.phone_number`
3. `SAMATA_DEFAULT_AGENT`

## Agent config

Agents are declarative JSON. The schema is `control-plane/src/lib/agent-config.ts`,
and the worker mirrors it in `worker/samata_worker/config.py`.

| Endpoint                  | Does                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/agents`        | Create. `201` with the agent and its `id`; `409` if the slug or phone number is taken. `slug` is optional and defaults to one derived from `name`. |
| `PATCH /api/agents/:ref`  | Partial update. Top-level keys of `config` you send replace the stored ones; the rest are kept.                                                    |
| `PUT /api/agents`         | Create or replace by slug (idempotent, good for config-as-code).                                                                                   |
| `GET /api/agents[/:ref]`  | List / fetch. `:ref` is an id or slug.                                                                                                             |
| `DELETE /api/agents/:ref` | Delete.                                                                                                                                            |

To create an agent:

```bash
curl -X POST localhost:3000/api/agents \
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

To change one part of it later:

```bash
curl -X PATCH localhost:3000/api/agents/support \
  -H "authorization: Bearer dev-api-key-change-me" -H "content-type: application/json" \
  -d '{ "config": { "firstMessage": "Thanks for calling Support!" } }'
```

Any field you leave out gets a default. Barge-in is on by default; the
`interruption` block tunes it. `server` URLs and secrets are never sent to the
worker.

## Tools and your webhook server

Like Vapi, you run one webhook server that holds all your tool endpoints, and
you define the tools in code. Samata calls it when an assistant uses a tool.

**1. Push your tools.** Create an API key on the API Keys page first;
`/api/tools` requires one. `PUT /api/tools` is idempotent (run it on every deploy):
it creates new tools, updates changed ones and leaves the rest. They show up on
the dashboard's Tools page.

```bash
curl -X PUT localhost:3000/api/tools \
  -H "authorization: Bearer $SAMATA_API_KEY" -H "content-type: application/json" \
  -d '{
    "server": { "url": "https://example.com/samata", "secret": "…" },
    "tools": [{
      "name": "lookup_order_status",
      "description": "Look up the shipping status of an order.",
      "parameters": { "type": "object", "properties": { "orderNumber": { "type": "string" } }, "required": ["orderNumber"] },
      "messageOnStart": "One moment while I look that up."
    }]
  }'
# -> { created: [...], updated: [...], unchanged: [...], deleted: [...], tools: [...] }
```

`server` registers your webhook server as the **tool server**: where every tool
without its own `server` is sent. It replaces the stored one, secret included.
Add `"prune": true` to delete library tools missing from the push, so the
library mirrors your code (`deleted[].usedBy` names assistants that still used
them). Without it a partial push never deletes anything.

**2. Give tools to assistants.** Turn them on in an assistant's Tools tab, or
list them by name in its config:

```json
{ "config": { "toolNames": ["lookup_order_status"] } }
```

Tools defined directly in `config.tools` still work, and win over a library
tool of the same name.

**3. Answer tool calls.** Samata POSTs to your server:

```json
{
  "message": {
    "type": "tool-calls",
    "call": {
      "id": "…",
      "agentId": "…",
      "type": "inbound",
      "customer": { "number": "+1415…" }
    },
    "toolCallList": [
      {
        "id": "call_1",
        "name": "lookup_order_status",
        "arguments": { "orderNumber": "A1234" }
      }
    ]
  }
}
```

and expects `{ "results": [{ "toolCallId": "call_1", "result": "…" }] }` (or
`"error"` instead of `"result"`). The `result` string goes to the LLM. The
secret arrives as `x-samata-secret`. `examples/webhook-server` does all three.

Which server gets a call, most specific first:
1. the tool's own `server`
2. a built-in of that name (`get_current_time`), run inside Samata
3. the assistant's `server` (the same URL that gets `end-of-call-report`)
4. the workspace tool server

| Endpoint                          | Does                                                           |
| --------------------------------- | -------------------------------------------------------------- |
| `PUT /api/tools`                  | Push many: `{ tools, prune?, server? }`. Returns what changed. |
| `GET /api/tools[/:name]`          | List / fetch, with `usedBy` (assistant slugs). No secrets.     |
| `PUT /api/tools/:name`            | Create or replace one tool.                                    |
| `DELETE /api/tools/:name`         | Delete. Assistants that listed it just skip it.                |
| `GET/PUT/DELETE /api/tool-server` | Read, set or clear the workspace tool server.                  |

## Phone calls (SIP)

Inbound calls reach an assistant like this:

```
caller ─► Telnyx number ─► Telnyx SIP connection ─► your SIP server (LiveKit SIP, :5060)
       ─► LiveKit inbound trunk + dispatch rule ─► room ─► Samata worker
       ─► control plane picks the assistant assigned to the dialed number
```

`docker compose up -d` runs the SIP server (`sip`) alongside LiveKit. Telnyx
has to be able to reach it, so it needs a public address:

1. Open 5060/tcp, 5060/udp and 10000-10100/udp on the machine running it (the
   production compose already points DNS and `SAMATA_SIP_HOST` at
   `LIVEKIT_DOMAIN`). On a laptop this isn't possible (and a tunnel like ngrok
   can't carry the UDP audio): see
   [Testing phone calls from your laptop](#testing-phone-calls-from-your-laptop).
2. Set `SAMATA_SIP_HOST` on the control plane to that address: a hostname,
   `host:port`, or IPv4.

Then on the Phone Numbers page choose **Import number**, enter a Telnyx API key
and a number from the same Telnyx account (E.164, e.g. `+14155550123`). Samata:

1. checks with Telnyx that the key is valid and the number is active on it, and
   stores the key encrypted (AES-256-GCM, keyed from `SAMATA_ENCRYPTION_KEY`,
   falling back to `BETTER_AUTH_SECRET`);
2. creates a LiveKit inbound trunk for the number that accepts calls only from
   Telnyx's published signaling addresses (override with
   `SAMATA_SIP_ALLOWED_ADDRESSES`), and a dispatch rule that gives each caller
   their own room and dispatches the worker;
3. creates a Telnyx SIP connection pointing at `SAMATA_SIP_HOST` and attaches
   the number to it. If the number was on another connection, it is put back
   there when you remove the number.

Choose the assistant for the number in the same table. Reassigning only changes
which assistant answers, so it's instant and never touches Telnyx or LiveKit.
A call to an imported number with no assistant is hung up (or goes to
`SAMATA_DEFAULT_AGENT` if set). If connecting fails (for example
`SAMATA_SIP_HOST` isn't set yet) the number stays imported as "Not connected",
and **Connect** retries it. Removing a number undoes the Telnyx and LiveKit
setup.

### Testing phone calls from your laptop

Everything except real phone calls runs fully local with no accounts:
`docker compose up -d`, the control plane and the worker. Browser test calls
use that stack. Real calls need a public SIP address, which a laptop doesn't
have, so for those use a [LiveKit Cloud](https://cloud.livekit.io) project
(free to create) for the media side instead of the local one.

**While you test phone calls, the local LiveKit server and SIP server are not
used.** Your worker and control plane keep running on your machine; only where
they connect changes.

1. In your LiveKit Cloud project, copy the project URL
   (`wss://<project>.livekit.cloud`), create an API key under Settings, and find
   the project's SIP address (`<id>.sip.livekit.cloud`).
2. Switch **both** `control-plane/.env` and `worker/.env` to it. They must point
   at the same LiveKit, or calls will ring and nobody will answer:

   ```
   LIVEKIT_URL=wss://<project>.livekit.cloud
   LIVEKIT_API_KEY=<key>
   LIVEKIT_API_SECRET=<secret>
   ```

   and in `control-plane/.env` only: `SAMATA_SIP_HOST=<id>.sip.livekit.cloud`.
3. Restart the control plane and the worker.
4. Optionally stop the local LiveKit and SIP servers
   (`docker compose stop livekit sip`). **Keep Postgres running** (your data).
   Redis is only used by the local LiveKit and SIP servers, so you can stop it too.
5. On the Phone Numbers page, **Import number** (or press **Connect** on one
   you already imported).

The worker needs no public address: it connects out to Cloud, which hands it
each call. `SAMATA_CONTROL_PLANE_URL` stays `http://localhost:3000`.

To go back to fully local, restore the original `LIVEKIT_*` values in both
files, clear `SAMATA_SIP_HOST`, restart, and `docker compose up -d`. A number
imported against one setup shows **Needs reconnect** after you switch: press
**Connect** and Samata rebuilds its trunk on the LiveKit you're now using.

If several people share one Cloud project, a call can land on anyone's worker.
Use a project each, or give each worker a unique `SAMATA_AGENT_NAME` (matching
`SAMATA_WORKER_AGENT_NAME` in their control plane).

The worker reads `sip.trunkPhoneNumber` and `sip.phoneNumber` from the caller's
participant attributes. To wire a trunk by hand instead, use the
[`lk` CLI](https://docs.livekit.io/sip/).

## Layout

```
docker-compose.yml        Dev infra: LiveKit, LiveKit SIP, Redis, Postgres, worker (profile)
deploy/                   Production compose (prebuilt images + Caddy) and .env.example
infra/livekit/            Dev livekit.yaml, sip.yaml (dev keys: devkey / samata_dev_secret_…)
control-plane/            Next.js 16, Hono under /api, Drizzle (agent, call_log), Dockerfile
worker/                   livekit-agents 1.8 worker, Dockerfile
.github/workflows/        Multi-arch image builds, published to GHCR
```

> The keys in `infra/livekit/*.yaml` and `.env.example` are development
> placeholders. Rotate all of them before you expose anything.

## License

Copyright (c) 2026 Samata.

Everything in this repository is licensed under the
[GNU Affero General Public License v3.0](LICENSE), except the contents of
[`ee/`](ee), which are licensed under the
[Elastic License 2.0](ee/LICENSE). You can self-host both for free. If you run
`ee/` in production, we'd love to hear about it.
