import assert from "node:assert/strict";
import { test } from "node:test";
import { WebSocket } from "ws";
import {
  DEEPGRAM_KEY,
  LISTEN_QUERY,
  OPENROUTER_KEY,
  PCM_SECOND,
  SPEAK_QUERY,
  chatRequest,
  dgHeaders,
  speakRequest,
  startProxy,
} from "../test-support/helpers.mjs";

const messages = (ws) => {
  const frames = [];
  ws.on("message", (data, isBinary) =>
    frames.push(isBinary ? data : JSON.parse(data.toString())),
  );
  return frames;
};
const today = () => new Date().toISOString().slice(0, 10);
const spent = (p) => p.store.get(`demo:day:${today()}:spent`);
const until = async (fn, ms = 2000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 10));
  }
  assert.fail("timed out waiting");
};
const opened = (ws) =>
  new Promise((resolve, reject) => {
    ws.once("open", resolve);
    ws.once("error", reject);
    ws.once("unexpected-response", (_req, res) =>
      reject(
        Object.assign(new Error(res.statusMessage), {
          status: res.statusCode,
          reason: res.statusMessage,
        }),
      ),
    );
  });
const closed = (ws) => until(() => ws.readyState === WebSocket.CLOSED);
const listen = (p, token, query = LISTEN_QUERY) =>
  new WebSocket(`${p.wsUrl}/v1/listen?${query}`, { headers: dgHeaders(token) });
const speak = (p, token, query = SPEAK_QUERY) =>
  new WebSocket(`${p.wsUrl}/v1/speak?${query}`, { headers: dgHeaders(token) });
const json = (frame) => JSON.stringify(frame);
const claim = (p, ip) =>
  fetch(`${p.url}/claim`, {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

// --- Claiming and the endpoints that exist -----------------------------------

test("claim hands out a token, a few times per address", async (t) => {
  const p = await startProxy({ DEMO_CLAIMS_PER_IP_PER_DAY: "2" });
  t.after(p.close);

  const first = await claim(p, "1.1.1.1");
  assert.equal(first.status, 200);
  const body = await first.json();
  assert.match(body.token, /^sk_demo_/);
  assert.ok(new Date(body.expiresAt) > new Date());

  assert.equal((await claim(p, "1.1.1.1")).status, 200);
  const third = await claim(p, "1.1.1.1");
  assert.equal(third.status, 429);
  assert.equal((await third.json()).error.code, "claim_limit");
  // Another address is unaffected.
  assert.equal((await claim(p, "2.2.2.2")).status, 200);
});

test("claim stops when the whole demo is full for the day", async (t) => {
  const p = await startProxy({ DEMO_DAILY_CLAIMS: "1" });
  t.after(p.close);
  assert.equal((await claim(p, "1.1.1.1")).status, 200);
  const res = await claim(p, "2.2.2.2");
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "demo_full");
});

test("only the demo's own endpoints exist", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const token = p.token();
  const res = await fetch(`${p.url}/v1/models`, {
    headers: { authorization: `Bearer ${token}` },
  });
  assert.equal(res.status, 404);
  assert.equal((await fetch(`${p.url}/healthz`)).status, 200);

  const ws = new WebSocket(`${p.wsUrl}/v1/other`, {
    headers: dgHeaders(token),
  });
  await assert.rejects(opened(ws), (err) => err.status === 404);
});

// --- Chat (OpenRouter) -------------------------------------------------------

test("chat: needs a valid token, and only the demo model", async (t) => {
  const p = await startProxy();
  t.after(p.close);

  for (const bad of [
    "sk_demo_nope",
    "sk_live_other",
    `${p.token().slice(0, -2)}AA`,
  ]) {
    assert.equal(
      (await fetch(`${p.url}/v1/chat/completions`, chatRequest(bad))).status,
      401,
    );
  }

  const wrong = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token(), { model: "openai/gpt-5" }),
  );
  assert.equal(wrong.status, 400);
  assert.equal((await wrong.json()).error.code, "model_not_allowed");
  assert.equal(p.fake.seen.chat.length, 0, "nothing reached OpenRouter");
});

test("chat: streams through with our key, clamps what it asks for, and counts the reported cost", async (t) => {
  const p = await startProxy();
  t.after(p.close);

  const res = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token(), {
      max_tokens: 100000,
      n: 5,
      // None of these reach OpenRouter.
      plugins: [{ id: "web" }],
      models: ["anthropic/claude-opus-4"],
      route: "fallback",
      provider: { order: ["someone-expensive"] },
      user: "someone-else",
    }),
  );
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type"), /text\/event-stream/);
  const text = await res.text();
  assert.match(text, /Hello/);
  assert.match(text, /\[DONE\]/);

  const [seen] = p.fake.seen.chat;
  assert.equal(seen.headers.authorization, `Bearer ${OPENROUTER_KEY}`);
  assert.ok(
    !JSON.stringify(seen.headers).includes("sk_demo_"),
    "OpenRouter never sees the demo token",
  );
  assert.equal(seen.body.max_tokens, 400);
  for (const dropped of ["n", "plugins", "models", "route", "provider"])
    assert.equal(seen.body[dropped], undefined, `${dropped} is dropped`);
  assert.match(
    seen.body.user,
    /^[0-9a-f]{24}$/,
    "the install, not what the client said",
  );
  assert.deepEqual(seen.body.usage, { include: true });

  // OpenRouter reported $0.000042: that, not an estimate.
  await until(async () => (await spent(p)) === 42);
});

test("chat: our provider preference is passed on when set", async (t) => {
  const p = await startProxy({ DEMO_LLM_PROVIDERS: "baseten, deepinfra" });
  t.after(p.close);
  await (
    await fetch(`${p.url}/v1/chat/completions`, chatRequest(p.token()))
  ).text();
  assert.deepEqual(p.fake.seen.chat[0].body.provider, {
    order: ["baseten", "deepinfra"],
    allow_fallbacks: true,
  });
});

test("chat: with no cost reported, it's counted from the token usage", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  p.fake.chatUsage = { prompt_tokens: 7, completion_tokens: 3 };
  const res = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token(), { stream: false }),
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).choices[0].message.content, "Hello there!");
  // 7 tokens in at $0.30 per million and 3 out at $1.20: 5.7, rounded up.
  await until(async () => (await spent(p)) === 6);
});

test("chat: with no usage at all, it's estimated from what was written", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  p.fake.chatUsage = null;
  await (
    await fetch(`${p.url}/v1/chat/completions`, chatRequest(p.token()))
  ).text();
  const [seen] = p.fake.seen.chat;
  // A token is about 4 characters: the request goes up, and "Hello there!" (3) comes back.
  const estimatedIn = Math.ceil(JSON.stringify(seen.body).length / 4);
  const expected = Math.ceil(estimatedIn * 0.3 + 3 * 1.2);
  await until(async () => Math.abs((await spent(p)) - expected) <= 1);
});

test("chat: an install that has spent its budget gets a 402 that says so", async (t) => {
  // A budget of a few micro-dollars: one request is more than enough.
  const p = await startProxy({ DEMO_INSTALL_BUDGET_USD: "0.000005" });
  t.after(p.close);
  const token = p.token();

  assert.equal(
    (await fetch(`${p.url}/v1/chat/completions`, chatRequest(token))).status,
    200,
  );
  await until(async () => (await spent(p)) > 0);
  const res = await fetch(`${p.url}/v1/chat/completions`, chatRequest(token));
  assert.equal(res.status, 402);
  const { error } = await res.json();
  assert.equal(error.code, "insufficient_credit");
  assert.match(error.message, /Deepgram and OpenRouter keys/);
  // A different install still has its own budget.
  assert.equal(
    (await fetch(`${p.url}/v1/chat/completions`, chatRequest(p.token())))
      .status,
    200,
  );
});

test("chat: when the day's budget is spent, every install gets a 402", async (t) => {
  const p = await startProxy({ DEMO_DAILY_BUDGET_USD: "0.000005" });
  t.after(p.close);
  assert.equal(
    (await fetch(`${p.url}/v1/chat/completions`, chatRequest(p.token())))
      .status,
    200,
  );
  await until(async () => (await spent(p)) > 0);
  const res = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token()),
  );
  assert.equal(res.status, 402);
  assert.match((await res.json()).error.message, /full for today/);
});

test("chat: requests per minute are limited", async (t) => {
  const p = await startProxy({ DEMO_REQUESTS_PER_MINUTE: "2" });
  t.after(p.close);
  const token = p.token();
  const statuses = [];
  for (let i = 0; i < 3; i++) {
    const res = await fetch(`${p.url}/v1/chat/completions`, chatRequest(token));
    statuses.push(res.status);
    await res.text();
  }
  assert.deepEqual(statuses, [200, 200, 429]);
});

test("chat: our key being refused is reported as the demo being down, not as a 401", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  p.fake.failWith = 401;
  const res = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token()),
  );
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error.code, "demo_unavailable");
  assert.ok(p.events.some((e) => e.event === "upstream_refused_key"));
});

test("chat: our OpenRouter balance running out reads as the demo being full", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  p.fake.failWith = 402;
  const res = await fetch(
    `${p.url}/v1/chat/completions`,
    chatRequest(p.token()),
  );
  assert.equal(res.status, 402);
  assert.match((await res.json()).error.message, /full for today/);
});

// --- Text-to-speech, one request at a time -----------------------------------

test("speak (one request): streams audio back with our key, for the demo's voices only", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const token = p.token();
  const url = (query) => `${p.url}/v1/speak?${query}`;

  const res = await fetch(url(SPEAK_QUERY), speakRequest(token));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get("dg-request-id"), "req_1");
  assert.equal(Buffer.from(await res.arrayBuffer()).length, 1000);
  const [seen] = p.fake.seen.speak;
  assert.equal(seen.headers.authorization, `Token ${DEEPGRAM_KEY}`);
  assert.deepEqual(seen.body, { text: "Hello there." });

  // 12 characters at $0.03 per 1k characters.
  await until(async () => (await spent(p)) === 360);

  const other = await fetch(url("model=aura-1-zeus-en"), speakRequest(token));
  assert.equal(other.status, 400);
  assert.equal((await other.json()).error.code, "model_not_allowed");
  assert.equal((await fetch(url(""), speakRequest(token))).status, 400);
  assert.equal(
    (
      await fetch(
        url(SPEAK_QUERY),
        speakRequest(token, { text: "a".repeat(5000) }),
      )
    ).status,
    413,
  );
  assert.equal(
    (await fetch(url(SPEAK_QUERY), speakRequest(token, { text: "  " }))).status,
    400,
  );
  assert.equal(
    (await fetch(url(SPEAK_QUERY), speakRequest("sk_demo_nope"))).status,
    401,
  );
  assert.equal(p.fake.seen.speak.length, 1);
});

// --- Speech-to-text (Deepgram listen) ----------------------------------------

test("listen: audio up and transcripts down, with our key and only what's allowed", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const ws = listen(
    p,
    p.token(),
    `${LISTEN_QUERY}&diarize=true&keyterm=Acme&redact=pci&extra=1`,
  );
  const frames = messages(ws);
  await opened(ws);

  ws.send(Buffer.alloc(3200));
  ws.send(json({ type: "KeepAlive" }));
  ws.send(json({ type: "Configure", something: "else" })); // not a thing the demo passes on
  ws.send(json({ type: "Finalize" }));
  await until(() => frames.some((f) => f.type === "Results"));
  assert.equal(
    frames.find((f) => f.type === "Results").channel.alternatives[0].transcript,
    "hello there",
  );
  ws.send(json({ type: "CloseStream" }));
  await closed(ws);

  const [session] = p.fake.seen.listen;
  assert.equal(session.headers.authorization, `Token ${DEEPGRAM_KEY}`);
  assert.equal(session.bytes, 3200, "the audio arrived intact");
  assert.deepEqual(
    session.frames.map((f) => f.type),
    ["KeepAlive", "Finalize", "CloseStream"],
  );
  const query = new URLSearchParams(session.url);
  assert.equal(query.get("model"), "nova-3");
  assert.equal(query.get("interim_results"), "true");
  for (const dropped of ["diarize", "keyterm", "redact", "extra"])
    assert.equal(query.has(dropped), false, `${dropped} is dropped`);
});

test("listen: refuses a bad token, other models, and other audio, saying why", async (t) => {
  const p = await startProxy();
  t.after(p.close);

  await assert.rejects(
    opened(listen(p, "sk_demo_nope")),
    (err) => err.status === 401,
  );
  await assert.rejects(
    opened(
      listen(p, p.token(), "model=nova-2&encoding=linear16&sample_rate=16000"),
    ),
    (err) =>
      err.status === 400 && /only transcribes with nova-3/.test(err.reason),
  );
  await assert.rejects(
    opened(
      listen(p, p.token(), "model=nova-3&encoding=opus&sample_rate=16000"),
    ),
    (err) => err.status === 400,
  );
  await assert.rejects(
    opened(
      listen(
        p,
        p.token(),
        "model=nova-3&encoding=linear16&sample_rate=16000&channels=2",
      ),
    ),
    (err) => err.status === 400,
  );
  assert.equal(p.fake.seen.listen.length, 0, "Deepgram never saw any of them");
  assert.deepEqual(
    p.proxy.slots.counts(),
    { stt: 0, tts: 0 },
    "and no slot was left held",
  );
});

test("listen: one conversation at a time per install", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const token = p.token();
  const first = listen(p, token);
  await opened(first);
  await assert.rejects(opened(listen(p, token)), (err) => err.status === 429);
  first.close();
  await closed(first);
  await until(() => p.proxy.slots.counts().stt === 0);
  const again = listen(p, token);
  await opened(again);
  again.close();
});

test("listen: time on the line is counted, by the second, at Deepgram's rate", async (t) => {
  // $0.6 a minute is a cent a second: easy to see. The two seconds of audio
  // below arrive at once, but are still two seconds.
  const p = await startProxy({ DEMO_STT_USD_PER_MIN: "0.6" });
  t.after(p.close);
  const ws = listen(p, p.token());
  await opened(ws);
  ws.send(Buffer.alloc(PCM_SECOND * 2));
  await until(() => p.fake.seen.listen[0]?.bytes === PCM_SECOND * 2);
  ws.send(json({ type: "CloseStream" }));
  await closed(ws);
  await until(async () => (await spent(p)) === 20000);
});

test("listen: even silence costs: the line is what Deepgram bills", async (t) => {
  const p = await startProxy({ DEMO_STT_USD_PER_MIN: "6" }); // 10 cents a second
  t.after(p.close);
  const ws = listen(p, p.token());
  await opened(ws);
  await new Promise((r) => setTimeout(r, 150));
  ws.close();
  await closed(ws);
  await until(async () => (await spent(p)) >= 10000);
});

test("listen: a conversation ends with a clear error when the install's budget runs out", async (t) => {
  // A second costs far more than the 100 micro-dollars this install has.
  const p = await startProxy({
    DEMO_INSTALL_BUDGET_USD: "0.0001",
    DEMO_STT_USD_PER_MIN: "60",
  });
  t.after(p.close);
  const ws = listen(p, p.token());
  const frames = messages(ws);
  let close;
  ws.on("close", (code, reason) => {
    close = { code, reason: reason.toString() };
  });
  await opened(ws);
  await until(() => frames.some((f) => f.type === "Error"));
  const frame = frames.find((f) => f.type === "Error");
  assert.equal(frame.code, "insufficient_credit");
  assert.equal(frame.error.retryable, false);
  assert.match(frame.description, /Deepgram and OpenRouter keys/);
  await closed(ws);
  assert.equal(close.code, 1008);
  assert.match(close.reason, /used up/);
});

test("listen: a conversation is cut off at the session limit", async (t) => {
  const p = await startProxy({ DEMO_MAX_SESSION_SECONDS: "0.1" });
  t.after(p.close);
  const ws = listen(p, p.token());
  const frames = messages(ws);
  await opened(ws);
  await until(() => frames.some((f) => f.type === "Error"));
  assert.equal(frames.find((f) => f.type === "Error").code, "session_limit");
  await closed(ws);
});

test("listen: Deepgram refusing the connection is passed on as busy or unavailable", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  p.fake.failWith = 429; // Deepgram's own concurrency cap
  await assert.rejects(
    opened(listen(p, p.token())),
    (err) => err.status === 503 && /busy/.test(err.reason),
  );
  p.fake.failWith = 401; // our key
  await assert.rejects(
    opened(listen(p, p.token())),
    (err) => err.status === 503 && /unavailable/.test(err.reason),
  );
  p.fake.failWith = 402;
  await assert.rejects(
    opened(listen(p, p.token())),
    (err) => err.status === 402,
  );
  await until(() => p.proxy.slots.counts().stt === 0);
});

// --- Text-to-speech, streaming (Deepgram speak) ------------------------------

test("speak (streaming): text up, audio down, counted by the character", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const ws = speak(p, p.token());
  const frames = messages(ws);
  await opened(ws);

  ws.send(json({ type: "Speak", text: "Hello " }));
  ws.send(json({ type: "Speak", text: "there " }));
  ws.send(Buffer.from("not text")); // binary isn't part of this protocol
  ws.send(json({ type: "Configure" })); // nor is this
  ws.send(json({ type: "Flush" }));
  await until(() => frames.some((f) => f.type === "Flushed"));
  assert.ok(
    frames.some((f) => Buffer.isBuffer(f) && f.length === 960),
    "audio came back",
  );
  ws.send(json({ type: "Close" }));
  await closed(ws);

  const [session] = p.fake.seen.speakWs;
  assert.equal(session.headers.authorization, `Token ${DEEPGRAM_KEY}`);
  assert.deepEqual(session.frames, [
    { type: "Speak", text: "Hello " },
    { type: "Speak", text: "there " },
    { type: "Flush" },
    { type: "Close" },
  ]);
  // 12 characters at $0.03 per 1k characters.
  await until(async () => (await spent(p)) === 360);
});

test("speak (streaming): the demo's voices only", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  await assert.rejects(
    opened(speak(p, p.token(), "model=aura-1-zeus-en&encoding=linear16")),
    (err) => err.status === 400 && /speaks with aura-2-\*/.test(err.reason),
  );
  await assert.rejects(
    opened(speak(p, "sk_demo_nope")),
    (err) => err.status === 401,
  );
  assert.equal(p.fake.seen.speakWs.length, 0);
});

test("speak (streaming): ends with a clear error when the budget runs out mid-sentence", async (t) => {
  // 30 micro-dollars a character, against a budget of 100.
  const p = await startProxy({ DEMO_INSTALL_BUDGET_USD: "0.0001" });
  t.after(p.close);
  const ws = speak(p, p.token());
  const frames = messages(ws);
  await opened(ws);
  for (let i = 0; i < 10; i++) ws.send(json({ type: "Speak", text: "word " }));
  await until(() => frames.some((f) => f.type === "Error"));
  assert.equal(
    frames.find((f) => f.type === "Error").code,
    "insufficient_credit",
  );
  await closed(ws);
  await until(async () => (await spent(p)) > 0);
  assert.ok(
    p.fake.seen.speakWs[0].frames.length < 10,
    "not everything went through",
  );
});

test("speak (streaming): one oversized message is refused outright", async (t) => {
  const p = await startProxy({ DEMO_MAX_TTS_CHARS: "50" });
  t.after(p.close);
  const ws = speak(p, p.token());
  const frames = messages(ws);
  await opened(ws);
  ws.send(json({ type: "Speak", text: "a".repeat(60) }));
  await until(() => frames.some((f) => f.type === "Error"));
  assert.equal(
    frames.find((f) => f.type === "Error").code,
    "request_too_large",
  );
  await closed(ws);
  assert.equal(p.fake.seen.speakWs[0].frames.length, 0);
});

test("speak (streaming): an install may hold only a couple of connections", async (t) => {
  const p = await startProxy({ DEMO_TTS_CONCURRENT_PER_INSTALL: "2" });
  t.after(p.close);
  const token = p.token();
  const a = speak(p, token);
  const b = speak(p, token);
  await Promise.all([opened(a), opened(b)]);
  await assert.rejects(opened(speak(p, token)), (err) => err.status === 429);
  a.close();
  await closed(a);
  await until(() => p.proxy.slots.counts().tts === 1);
  const c = speak(p, token);
  await opened(c);
  b.close();
  c.close();
});

// --- The demo's own capacity --------------------------------------------------

test("busy: past the cap on conversations, a new one is turned away until one ends", async (t) => {
  const p = await startProxy({ DEMO_MAX_CONVERSATIONS: "2" });
  t.after(p.close);

  const a = listen(p, p.token());
  const b = listen(p, p.token());
  await Promise.all([opened(a), opened(b)]);
  assert.deepEqual(p.proxy.slots.counts(), { stt: 2, tts: 0 });

  await assert.rejects(
    opened(listen(p, p.token())),
    (err) =>
      err.status === 503 &&
      /busy right now\. Try again in a minute/.test(err.reason),
  );
  assert.ok(
    p.events.some((e) => e.event === "slot_refused" && e.reason === "busy"),
  );

  a.close();
  await closed(a);
  await until(() => p.proxy.slots.counts().stt === 1);
  const c = listen(p, p.token());
  await opened(c);
  b.close();
  c.close();
  await until(() => p.proxy.slots.counts().stt === 0);
});

test("busy: voice connections have a cap of their own", async (t) => {
  const p = await startProxy({ DEMO_MAX_TTS_STREAMS: "1" });
  t.after(p.close);
  const a = speak(p, p.token());
  await opened(a);
  await assert.rejects(
    opened(speak(p, p.token())),
    (err) => err.status === 503 && /busy/.test(err.reason),
  );
  // Listening isn't affected by it.
  const l = listen(p, p.token());
  await opened(l);
  a.close();
  l.close();
});

test("busy: a client that gives up while we connect doesn't leave its slot held", async (t) => {
  const p = await startProxy({ DEMO_MAX_CONVERSATIONS: "1" });
  t.after(p.close);
  const gone = listen(p, p.token());
  gone.on("error", () => {});
  gone.terminate();
  await until(() => p.proxy.slots.counts().stt === 0);
  const next = listen(p, p.token());
  await opened(next);
  next.close();
});

test("healthz says how many are open", async (t) => {
  const p = await startProxy();
  t.after(p.close);
  const ws = listen(p, p.token());
  await opened(ws);
  const body = await (await fetch(`${p.url}/healthz`)).json();
  assert.deepEqual(body, { ok: true, open: { stt: 1, tts: 0 } });
  ws.close();
});
