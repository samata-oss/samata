# Example webhook server

A minimal version of the server you run yourself when you use Samata, shaped
like Vapi's: **one URL** that receives every message as
`{ message: { type, call, ... } }`.

```bash
SAMATA_API_KEY=… pnpm example:webhooks     # from the repo root; listens on :4000
```

| `message.type`       | Does                                                                 |
| -------------------- | -------------------------------------------------------------------- |
| `tool-calls`         | Runs the named tool; replies `{ results: [{ toolCallId, result }] }` |
| `end-of-call-report` | Logs the finished call; replies `{}`                                 |

**Tools live in code.** Edit the `tools` array in `src/index.ts` (name,
description, JSON Schema parameters, handler). On start the server pushes them
to Samata (`PUT /api/tools`) and registers its own URL as the workspace **tool
server**, so they appear on the dashboard's Tools page. Turn them on for an
assistant from its Tools tab, or list the names in its `config.toolNames`. Pushing is
idempotent, so restarting is safe. Without `SAMATA_API_KEY` it only serves.

| Env              | Default                 | Meaning                                                                                            |
| ---------------- | ----------------------- | -------------------------------------------------------------------------------------------------- |
| `SAMATA_API_KEY` | none                    | An API key from the dashboard's API Keys page. Lets the server push its tools. Unset = don't push. |
| `SAMATA_URL`     | `http://localhost:3000` | The control plane.                                                                                 |
| `PUBLIC_URL`     | `http://localhost:4000` | Where Samata reaches this server.                                                                  |
| `EXAMPLE_SECRET` | none                    | Checked against `x-samata-secret`; also pushed to Samata so both sides agree.                      |

If Samata runs in Docker, set `PUBLIC_URL` to use `host.docker.internal`
instead of `localhost`. `pnpm db:seed` sets up the demo assistant with the same
tools and server, so it works before the server has pushed anything.

**Testing failures.** Add query params to `PUBLIC_URL` (or to the tool
server's URL in the dashboard):

- `?delay=15000` waits 15 s (hits the timeout)
- `?status=500` returns that HTTP status
- `?malformed=1` returns invalid JSON
