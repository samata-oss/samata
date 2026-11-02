# Example webhook server

A minimal version of the server you run yourself when you use Samata. It
answers tool calls and receives agent events.

```bash
pnpm example:webhooks          # from the repo root; listens on :4000
```

| Endpoint             | Configure it as            | Does                                            |
| -------------------- | -------------------------- | ----------------------------------------------- |
| `POST /order-status` | A tool's server URL        | Replies `{ results: [{ toolCallId, result }] }` |
| `POST /events`       | The assistant's server URL | Logs events, e.g. the `end-of-call-report`      |

`pnpm db:seed` points the seeded assistant at both.

**Secret.** Set `EXAMPLE_SECRET` and the same value as the tool or assistant's
secret in the dashboard. Requests without a matching `x-samata-secret` header
get a 401.

**Testing failures.** Add query params to the URL you configure in Samata:

- `?delay=15000` waits 15 s (hits the timeout)
- `?status=500` returns that HTTP status
- `?malformed=1` returns invalid JSON

If Samata runs in Docker, replace `localhost` in the URL with
`host.docker.internal`.
