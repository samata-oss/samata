import { createServer } from "node:http";
import { WebSocketServer } from "ws";
import { loadConfig } from "../src/config.mjs";
import { createProxy } from "../src/server.mjs";
import { memoryStore } from "../src/store.mjs";
import { issueToken } from "../src/token.mjs";

export const DEEPGRAM_KEY = "dg_the_real_deepgram_key";
export const OPENROUTER_KEY = "sk-or-v1-the_real_openrouter_key";
export const SECRET = "s".repeat(48);
/** Bytes in a second of 16 kHz, 16-bit mono audio. */
export const PCM_SECOND = 32000;

export const LISTEN_QUERY =
  "model=nova-3&encoding=linear16&sample_rate=16000&channels=1&interim_results=true";
export const SPEAK_QUERY =
  "model=aura-2-andromeda-en&encoding=linear16&sample_rate=24000";

/**
 * A stand-in for Deepgram and OpenRouter at once (they have different paths):
 * records what it's sent and answers the way each documents.
 */
async function fakeProviders() {
  const seen = { chat: [], speak: [], listen: [], speakWs: [] };
  const fake = {
    seen,
    /** Make the next HTTP/WS request fail with this status. */
    failWith: null,
    chatReply: ["Hello", " there", "!"],
    /** What OpenRouter reports for a chat: a cost, or just token counts. */
    chatUsage: { prompt_tokens: 7, completion_tokens: 3, cost: 0.000042 },
  };

  const http = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks).toString();
    if (fake.failWith) {
      res.writeHead(fake.failWith, { "content-type": "application/json" });
      return res.end(JSON.stringify({ error: { code: "x", message: "nope" } }));
    }
    if (req.url === "/v1/chat/completions") {
      const body = JSON.parse(raw);
      seen.chat.push({ headers: req.headers, body });
      if (!body.stream) {
        res.writeHead(200, { "content-type": "application/json" });
        return res.end(
          JSON.stringify({
            choices: [{ message: { content: fake.chatReply.join("") } }],
            ...(fake.chatUsage && { usage: fake.chatUsage }),
          }),
        );
      }
      res.writeHead(200, { "content-type": "text/event-stream" });
      res.write(": OPENROUTER PROCESSING\n\n");
      for (const piece of fake.chatReply) {
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`,
        );
        await new Promise((r) => setTimeout(r, 5));
      }
      if (fake.chatUsage)
        res.write(
          `data: ${JSON.stringify({ choices: [], usage: fake.chatUsage })}\n\n`,
        );
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    if (req.url.startsWith("/v1/speak") && req.method === "POST") {
      seen.speak.push({
        url: req.url,
        headers: req.headers,
        body: JSON.parse(raw),
      });
      res.writeHead(200, {
        "content-type": "audio/wav",
        "dg-request-id": "req_1",
      });
      res.write(Buffer.alloc(500, 1));
      await new Promise((r) => setTimeout(r, 5));
      return res.end(Buffer.alloc(500, 2));
    }
    res.writeHead(404).end();
  });

  const wss = new WebSocketServer({ noServer: true });
  http.on("upgrade", (req, socket, head) => {
    if (fake.failWith) {
      socket.write(
        `HTTP/1.1 ${fake.failWith} X\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`,
      );
      return socket.destroy();
    }
    const { pathname, search } = new URL(req.url, "http://x");
    wss.handleUpgrade(req, socket, head, (ws) => {
      if (pathname === "/v1/listen") {
        const session = {
          url: search,
          headers: req.headers,
          frames: [],
          bytes: 0,
        };
        seen.listen.push(session);
        ws.on("message", (data, isBinary) => {
          if (isBinary) {
            session.bytes += data.length;
            return;
          }
          const frame = JSON.parse(data.toString());
          session.frames.push(frame);
          if (frame.type === "Finalize")
            ws.send(
              JSON.stringify({
                type: "Results",
                is_final: true,
                channel: { alternatives: [{ transcript: "hello there" }] },
              }),
            );
          if (frame.type === "CloseStream") {
            ws.send(JSON.stringify({ type: "Metadata" }));
            ws.close();
          }
        });
      } else if (pathname === "/v1/speak") {
        const session = { url: search, headers: req.headers, frames: [] };
        seen.speakWs.push(session);
        ws.on("message", (data, isBinary) => {
          if (isBinary) return;
          const frame = JSON.parse(data.toString());
          session.frames.push(frame);
          if (frame.type === "Flush") {
            ws.send(Buffer.alloc(960, 3), { binary: true });
            ws.send(JSON.stringify({ type: "Flushed", sequence_id: 0 }));
          }
          if (frame.type === "Close") ws.close();
        });
      } else {
        ws.close();
      }
    });
  });

  await new Promise((r) => http.listen(0, "127.0.0.1", r));
  fake.url = `http://127.0.0.1:${http.address().port}`;
  fake.close = async () => {
    for (const ws of wss.clients) ws.terminate();
    http.closeAllConnections();
    await new Promise((r) => http.close(r));
  };
  return fake;
}

/** The proxy in front of fake providers. `env` overrides the settings. */
export async function startProxy(env = {}) {
  const fake = await fakeProviders();
  const config = loadConfig({
    DEEPGRAM_API_KEY: DEEPGRAM_KEY,
    OPENROUTER_API_KEY: OPENROUTER_KEY,
    DEEPGRAM_URL: fake.url,
    OPENROUTER_URL: fake.url,
    DEMO_TOKEN_SECRET: SECRET,
    DEMO_METER_INTERVAL_MS: "20",
    REDIS_URL: "memory",
    ...env,
  });
  const store = memoryStore();
  const quiet = [];
  const proxy = createProxy({
    config,
    store,
    log: (event, fields) => quiet.push({ event, ...fields }),
  });
  const port = await proxy.listen(0, "127.0.0.1");
  return {
    url: `http://127.0.0.1:${port}`,
    wsUrl: `ws://127.0.0.1:${port}`,
    fake,
    config,
    store,
    proxy,
    events: quiet,
    token: () => issueToken(SECRET),
    close: async () => {
      await proxy.close();
      await fake.close();
    },
  };
}

export const chatRequest = (token, body = {}) => ({
  method: "POST",
  headers: {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({
    model: "deepseek/deepseek-v4.1-flash",
    messages: [{ role: "user", content: "hi" }],
    stream: true,
    ...body,
  }),
});

/** Deepgram's clients send `Authorization: Token <key>`. */
export const speakRequest = (token, body = {}) => ({
  method: "POST",
  headers: {
    authorization: `Token ${token}`,
    "content-type": "application/json",
  },
  body: JSON.stringify({ text: "Hello there.", ...body }),
});

export const dgHeaders = (token) => ({ authorization: `Token ${token}` });
