import { createServer } from "node:http";
import { once } from "node:events";
import { StringDecoder } from "node:string_decoder";
import { WebSocket, WebSocketServer } from "ws";
import { createBudget } from "./budget.mjs";
import { allowed } from "./config.mjs";
import { createSlots } from "./slots.mjs";
import { credential, issueToken, verifyToken } from "./token.mjs";

/**
 * The demo proxy: what a fresh quickstart talks to instead of the providers.
 *
 *   POST /claim                  a token for a new install
 *   POST /v1/chat/completions    OpenRouter chat (streamed back as it's written)
 *   WS   /v1/listen              Deepgram speech-to-text (audio up, transcripts down)
 *   WS   /v1/speak               Deepgram text-to-speech (text up, audio down)
 *   POST /v1/speak               the same, one request at a time
 *
 * Each of those is the provider's own API, passed through untranslated, so the
 * worker and control plane use their ordinary Deepgram and OpenRouter code with
 * a demo token where the provider's key would go. The proxy checks the token,
 * the model, and what the install and the day have left, forwards with Samata's
 * own keys, and counts what it forwarded. Nothing else is reachable, so the
 * keys can't be used for anything but this.
 */

const ADD_KEYS =
  "Add your own Deepgram and OpenRouter keys on the Provider Keys page";
const USED_UP = `The free Samata demo is used up. ${ADD_KEYS} to keep going.`;
const FULL_TODAY = `The free Samata demo is full for today. Try again tomorrow, or ${ADD_KEYS.toLowerCase()}.`;
const BUSY = "The free Samata demo is busy right now. Try again in a minute.";
const UNAVAILABLE = "The free demo is unavailable right now.";

const HEADERS_PASSED_BACK = [
  "content-type",
  "cache-control",
  "x-request-id",
  "dg-request-id",
  "dg-model-name",
];

/**
 * What a client may ask of each provider; everything else is dropped. Notably
 * absent: the features Deepgram bills extra for (redaction, diarization,
 * keyterms, entity detection) and any other way to spend more per second.
 */
const LISTEN_PARAMS = new Set([
  "model",
  "language",
  "punctuate",
  "smart_format",
  "no_delay",
  "interim_results",
  "encoding",
  "vad_events",
  "sample_rate",
  "channels",
  "endpointing",
  "filler_words",
  "profanity_filter",
  "numerals",
  "mip_opt_out",
  "utterance_end_ms",
  "dictation",
]);
const SPEAK_PARAMS = new Set([
  "model",
  "encoding",
  "sample_rate",
  "bit_rate",
  "speed",
  "container",
  "mip_opt_out",
]);
/** The OpenRouter request fields a chat may use. No `plugins`, `models`, `route`, `transforms`. */
const CHAT_FIELDS = [
  "model",
  "messages",
  "stream",
  "stream_options",
  "temperature",
  "top_p",
  "top_k",
  "max_tokens",
  "max_completion_tokens",
  "stop",
  "tools",
  "tool_choice",
  "parallel_tool_calls",
  "frequency_penalty",
  "presence_penalty",
  "repetition_penalty",
  "seed",
  "response_format",
  "reasoning",
];
/** The control messages a speech-to-text client may send besides audio. */
const LISTEN_CONTROL = new Set(["KeepAlive", "Finalize", "CloseStream"]);
/** And a text-to-speech client besides `Speak`. */
const SPEAK_CONTROL = new Set(["Flush", "Clear", "Close"]);

class HttpError extends Error {
  constructor(status, code, message, retryable = false) {
    super(message);
    this.status = status;
    this.code = code;
    this.retryable = retryable;
  }
}

const errorBody = (code, message, retryable = false) => ({
  error: { code, message, retryable },
});

function sendJson(res, status, body, headers = {}) {
  if (res.headersSent) return res.end();
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function sendError(res, err) {
  sendJson(res, err.status, errorBody(err.code, err.message, err.retryable));
}

async function readBody(req, limit) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit)
      throw new HttpError(
        413,
        "request_too_large",
        "That request is too large for the demo.",
      );
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

function parseJson(buffer) {
  try {
    const value = JSON.parse(buffer.toString("utf8"));
    if (value && typeof value === "object" && !Array.isArray(value))
      return value;
  } catch {}
  throw new HttpError(
    400,
    "invalid_request",
    "The request body must be a JSON object.",
  );
}

/** The `type` of a small JSON control message, or undefined. */
function controlType(data) {
  if (data.length > 4096) return undefined;
  try {
    return JSON.parse(data.toString("utf8"))?.type;
  } catch {
    return undefined;
  }
}

/** The query parameters a client sent, minus any not in `names`. */
function pick(searchParams, names) {
  const kept = new URLSearchParams();
  for (const [key, value] of searchParams)
    if (names.has(key)) kept.append(key, value);
  return kept;
}

/** Tokens in a piece of text, roughly: good enough to size a cap. */
const estimateTokens = (chars) => Math.ceil(chars / 4);

/**
 * Reads a chat response as it streams past and works out what it cost: what
 * OpenRouter says it charged if it says, otherwise the usage it reports,
 * otherwise the length of what was written. Handles both the streamed form
 * (server-sent events) and a plain JSON reply.
 */
function chatMeter(contentType) {
  const streamed = contentType?.includes("text/event-stream");
  // fetch gives Uint8Arrays, and a character can be split across two of them.
  const decoder = new StringDecoder("utf8");
  let pending = "";
  let whole = "";
  let chars = 0;
  let usage = null;

  const scan = (data) => {
    const choices = Array.isArray(data?.choices) ? data.choices : [];
    for (const choice of choices) {
      const piece = choice.delta ?? choice.message ?? {};
      if (typeof piece.content === "string") chars += piece.content.length;
      for (const call of piece.tool_calls ?? [])
        chars += (call.function?.arguments ?? "").length;
    }
    if (data?.usage && typeof data.usage === "object") usage = data.usage;
  };

  return {
    push(chunk) {
      const text = decoder.write(Buffer.from(chunk));
      if (!streamed) {
        if (whole.length < 2_000_000) whole += text;
        return;
      }
      pending += text;
      let newline = pending.indexOf("\n");
      while (newline !== -1) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line.startsWith("data:") && !line.endsWith("[DONE]")) {
          try {
            scan(JSON.parse(line.slice(5)));
          } catch {}
        }
        newline = pending.indexOf("\n");
      }
    },
    result() {
      if (!streamed) {
        try {
          scan(JSON.parse(whole));
        } catch {}
      }
      return {
        costUsd: Number.isFinite(usage?.cost) ? usage.cost : null,
        tokensIn: Number.isFinite(usage?.prompt_tokens)
          ? usage.prompt_tokens
          : null,
        tokensOut: Number.isFinite(usage?.completion_tokens)
          ? usage.completion_tokens
          : estimateTokens(chars),
      };
    },
  };
}

/** A client of a speech connection did something the demo doesn't allow. */
class Refusal extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

export function createProxy({
  config,
  store,
  log = defaultLog,
  now = () => Date.now(),
}) {
  const budget = createBudget({ store, config, now });
  const slots = createSlots({
    stt: {
      total: config.limits.conversations,
      perInstall: config.limits.sttPerInstall,
    },
    tts: {
      total: config.limits.ttsStreams,
      perInstall: config.limits.ttsPerInstall,
    },
  });

  const clientIp = (req) => {
    if (config.trustProxy) {
      const forwarded = req.headers["x-forwarded-for"];
      if (forwarded) return String(forwarded).split(",").at(-1).trim();
    }
    return req.socket.remoteAddress ?? "unknown";
  };

  /** The install behind a request's token, or a 401. */
  const authenticate = (req) => {
    const installId = verifyToken(
      config.tokenSecret,
      credential(req.headers.authorization),
      {
        ttlDays: config.tokenTtlDays,
        now: now(),
      },
    );
    if (!installId) {
      throw new HttpError(
        401,
        "authentication_failed",
        `That isn't a valid demo key. Re-run the quickstart, or ${ADD_KEYS.toLowerCase()}.`,
      );
    }
    return installId;
  };

  /** 402 if the install or the day is out of budget. */
  const requireBudget = async (installId) => {
    const state = await budget.check(installId);
    if (state.ok) return;
    log("exhausted", { reason: state.reason, install: installId });
    throw new HttpError(
      402,
      "insufficient_credit",
      state.reason === "day" ? FULL_TODAY : USED_UP,
    );
  };

  const requireRate = async (installId) => {
    if (!(await budget.allowRequest(installId))) {
      throw new HttpError(
        429,
        "rate_limited",
        "Slow down a little: the demo is rate limited.",
        true,
      );
    }
  };

  const requireModel = (kind, model, what) => {
    if (allowed(config.models[kind], model)) return;
    throw new HttpError(
      400,
      "model_not_allowed",
      `The demo only ${what} with ${config.models[kind].join(", ")}. Add your own key to use other models.`,
    );
  };

  /**
   * Send a request to a provider and stream its answer back. `observe` is
   * given the response's content type and returns something with `push(chunk)`
   * to see every piece of it; `onDone` runs once it's over (or the client
   * left), so a cost can be counted either way.
   */
  async function forward(res, upstreamUrl, body, headers, hooks = {}) {
    const { observe, onDone } = hooks;
    const controller = new AbortController();
    res.on("close", () => {
      if (!res.writableFinished) controller.abort();
    });

    let upstream;
    try {
      upstream = await fetch(upstreamUrl, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body,
        signal: controller.signal,
      });
    } catch (err) {
      await onDone?.();
      if (controller.signal.aborted) return;
      log("upstream_unreachable", { message: err.message });
      throw new HttpError(
        502,
        "upstream_unreachable",
        "Couldn't reach the speech service.",
        true,
      );
    }

    // Our key being refused is our problem, not the caller's: don't pass on a 401.
    if (upstream.status === 401 || upstream.status === 403) {
      log("upstream_refused_key", { status: upstream.status });
      await upstream.body?.cancel();
      await onDone?.();
      throw new HttpError(503, "demo_unavailable", UNAVAILABLE, true);
    }
    if (upstream.status === 402) {
      log("upstream_out_of_credit");
      await upstream.body?.cancel();
      await onDone?.();
      throw new HttpError(402, "insufficient_credit", FULL_TODAY);
    }

    const passed = {};
    for (const name of HEADERS_PASSED_BACK) {
      const value = upstream.headers.get(name);
      if (value) passed[name] = value;
    }
    res.writeHead(upstream.status, passed);
    const observer = observe?.(passed["content-type"]);
    try {
      for await (const chunk of upstream.body ?? []) {
        observer?.push(chunk);
        if (!res.write(chunk) && !res.destroyed)
          await once(res, "drain").catch(() => {});
      }
      res.end();
    } catch {
      // The client left, or the provider dropped: either way, nothing more to send.
      res.destroy();
    } finally {
      await onDone?.();
    }
  }

  async function claim(req, res) {
    await readBody(req, 4096);
    const ip = clientIp(req);
    const result = await budget.allowClaim(ip);
    if (!result.ok) {
      log("claim_refused", { reason: result.reason, ip });
      if (result.reason === "ip") {
        throw new HttpError(
          429,
          "claim_limit",
          "This address has already claimed the demo a few times today.",
        );
      }
      throw new HttpError(503, "demo_full", FULL_TODAY, true);
    }
    const token = issueToken(config.tokenSecret, { now: now() });
    log("claim", { ip });
    sendJson(res, 200, {
      token,
      expiresAt: new Date(
        now() + config.tokenTtlDays * 86400_000,
      ).toISOString(),
    });
  }

  async function chat(req, res) {
    const installId = authenticate(req);
    await requireBudget(installId);
    await requireRate(installId);

    const raw = await readBody(req, config.limits.chatBodyBytes);
    const given = parseJson(raw);
    requireModel("llm", given.model, "runs");
    if (!Array.isArray(given.messages)) {
      throw new HttpError(400, "invalid_request", "messages must be an array.");
    }
    const body = {};
    for (const field of CHAT_FIELDS)
      if (given[field] !== undefined) body[field] = given[field];
    // One short reply: the demo is for conversation.
    const cap = config.limits.maxTokens;
    body.max_tokens = Math.min(Number(body.max_tokens) || cap, cap);
    if (body.max_completion_tokens !== undefined) {
      body.max_completion_tokens = Math.min(
        Number(body.max_completion_tokens) || cap,
        cap,
      );
    }
    // Who it's for (OpenRouter's abuse tooling groups by this), what it
    // costs (reported back with the usage), and which hosts we'd rather use.
    body.user = installId;
    body.usage = { include: true };
    if (config.llmProviders.length > 0)
      body.provider = { order: config.llmProviders, allow_fallbacks: true };
    const outgoing = JSON.stringify(body);

    // The whole conversation goes up every turn, so the input is known now.
    const estimatedIn = estimateTokens(outgoing.length);
    const upFront = budget.cost.llm(estimatedIn, 0);
    await budget.charge(installId, upFront);

    let meter = null;
    await forward(
      res,
      `${config.openrouterUrl}/v1/chat/completions`,
      outgoing,
      {
        authorization: `Bearer ${config.openrouterKey}`,
        accept: req.headers.accept ?? "*/*",
        "x-title": "Samata demo",
      },
      {
        observe: (contentType) => {
          meter = chatMeter(contentType);
          return meter;
        },
        onDone: async () => {
          const { costUsd, tokensIn, tokensOut } = meter?.result() ?? {
            costUsd: null,
            tokensIn: null,
            tokensOut: 0,
          };
          // Swap the up-front estimate for what OpenRouter says it cost, or
          // failing that for what the usage works out to.
          const total =
            costUsd !== null
              ? Math.round(costUsd * 1_000_000)
              : budget.cost.llm(tokensIn ?? estimatedIn, tokensOut);
          await budget.charge(installId, total - upFront);
        },
      },
    );
  }

  /** One-shot text-to-speech: `POST /v1/speak` with `{ "text": "..." }`. */
  async function speak(req, res, url) {
    const installId = authenticate(req);
    await requireBudget(installId);
    await requireRate(installId);

    const query = pick(url.searchParams, SPEAK_PARAMS);
    requireModel("tts", query.get("model"), "speaks");
    const body = parseJson(await readBody(req, 16 * 1024));
    if (typeof body.text !== "string" || !body.text.trim()) {
      throw new HttpError(
        400,
        "invalid_request",
        "text must be the text to speak.",
      );
    }
    if (body.text.length > config.limits.ttsChars) {
      throw new HttpError(
        413,
        "request_too_large",
        "That's too much text to speak in the demo.",
      );
    }
    await budget.charge(installId, budget.cost.tts(body.text.length));
    await forward(
      res,
      `${config.deepgramUrl}/v1/speak?${query}`,
      JSON.stringify({ text: body.text }),
      {
        authorization: `Token ${config.deepgramKey}`,
        accept: req.headers.accept ?? "*/*",
      },
    );
  }

  /**
   * Counts what a speech connection costs as it goes, without a trip to the
   * store for every word: it starts from what the install has left, spends
   * that down locally, and settles with the store every so often.
   */
  async function openMeter(installId) {
    let allowance = await budget.remaining(installId);
    let unsettled = 0;
    return {
      /** false once more has been spent than was left. */
      add(micro) {
        unsettled += micro;
        allowance -= micro;
        return allowance > 0;
      },
      async settle() {
        // Rounded, with the remainder carried: no cost is lost or doubled.
        const owed = Math.round(unsettled);
        unsettled -= owed;
        await budget.charge(installId, owed);
        allowance = (await budget.remaining(installId)) - unsettled;
        return allowance > 0;
      },
    };
  }

  /** Answer a refused WebSocket upgrade with a plain HTTP status. */
  function refuseUpgrade(socket, status, message) {
    // The reason phrase is all a WebSocket client reports of a refusal.
    const reason = String(message)
      .replace(/[^\x20-\x7e]/g, " ")
      .slice(0, 200);
    socket.write(
      `HTTP/1.1 ${status} ${reason}\r\nconnection: close\r\ncontent-length: 0\r\n\r\n`,
    );
    socket.destroy();
  }

  const wss = new WebSocketServer({ noServer: true, maxPayload: 256 * 1024 });

  /** What to check and count for a speech-to-text connection, or an HttpError. */
  function listenSession(url) {
    const query = pick(url.searchParams, LISTEN_PARAMS);
    requireModel("stt", query.get("model"), "transcribes");
    const rate = Number(query.get("sample_rate"));
    const channels = Number(query.get("channels") ?? 1);
    if (
      query.get("encoding") !== "linear16" ||
      !Number.isInteger(rate) ||
      rate < 8000 ||
      rate > 48000 ||
      channels !== 1
    ) {
      throw new HttpError(
        400,
        "invalid_request",
        "The demo takes mono linear16 audio at 8 to 48 kHz.",
      );
    }
    return { kind: "stt", query, bytesPerSecond: rate * 2 };
  }

  function speakSession(url) {
    const query = pick(url.searchParams, SPEAK_PARAMS);
    requireModel("tts", query.get("model"), "speaks");
    return { kind: "tts", query };
  }

  async function upgrade(req, socket, head) {
    socket.on("error", () => {});
    const url = new URL(req.url, "http://localhost");

    let installId;
    let session;
    let slot;
    let meter;
    try {
      if (url.pathname !== "/v1/listen" && url.pathname !== "/v1/speak")
        throw new HttpError(404, "not_found", "Not Found");
      installId = authenticate(req);
      await requireBudget(installId);
      await requireRate(installId);
      session =
        url.pathname === "/v1/listen" ? listenSession(url) : speakSession(url);
      const taken = slots.acquire(session.kind, installId);
      if (!taken.ok) {
        log("slot_refused", { kind: session.kind, reason: taken.reason });
        throw taken.reason === "busy"
          ? new HttpError(503, "demo_busy", BUSY, true)
          : new HttpError(
              429,
              "rate_limited",
              session.kind === "stt"
                ? "Only one conversation at a time in the demo."
                : "Too many voice connections open at once in the demo.",
              true,
            );
      }
      slot = taken;
      // Before the upgrade completes: messages that arrive meanwhile would be lost.
      meter = await openMeter(installId);
    } catch (err) {
      slot?.release();
      if (err instanceof HttpError)
        return refuseUpgrade(socket, err.status, err.message);
      log("upgrade_error", { message: err.message });
      return refuseUpgrade(socket, 500, "Internal Server Error");
    }

    let settled = false;
    const finish = () => slot.release();
    const upstream = new WebSocket(
      `${config.deepgramUrl.replace(/^http/, "ws")}${url.pathname}?${session.query}`,
      {
        headers: { authorization: `Token ${config.deepgramKey}` },
        handshakeTimeout: 10_000,
      },
    );
    const refuse = (status, message) => {
      if (settled) return;
      settled = true;
      finish();
      refuseUpgrade(socket, status, message);
    };
    // The client gave up while we were still connecting to the provider.
    socket.once("close", () => {
      if (settled) return;
      settled = true;
      finish();
      upstream.terminate();
    });
    upstream.once("unexpected-response", (_req, response) => {
      response.resume();
      const status = response.statusCode;
      log("upstream_ws_refused", { kind: session.kind, status });
      if (status === 402) refuse(402, FULL_TODAY);
      // Deepgram's own connection cap: as far as the caller is concerned, busy.
      else if (status === 429) refuse(503, BUSY);
      else refuse(503, UNAVAILABLE);
      upstream.terminate();
    });
    upstream.once("error", () =>
      refuse(502, "Couldn't reach the speech service."),
    );
    upstream.once("open", () => {
      if (settled) return upstream.close();
      settled = true;
      wss.handleUpgrade(req, socket, head, (client) => {
        bridge({ client, upstream, installId, session, meter }).finally(finish);
      });
    });
  }

  /**
   * Connect a client to Deepgram's session, passing both ways what the
   * provider's protocol allows and counting what it costs:
   *
   *   speech-to-text: what Deepgram bills, the longer of the connection's
   *     lifetime and the audio sent, by the second;
   *   text-to-speech: the characters in each `Speak` message.
   */
  function bridge({ client, upstream, installId, session, meter }) {
    const opened = performance.now();
    let audioBytes = 0;
    let billedSeconds = 0;

    /** Add the speech-to-text time not yet counted. */
    const countTime = () => {
      if (session.kind !== "stt") return;
      const seconds = Math.max(
        (performance.now() - opened) / 1000,
        audioBytes / session.bytesPerSecond,
      );
      meter.add(budget.cost.stt(seconds - billedSeconds));
      billedSeconds = seconds;
    };

    /** What to do with a message from the client: true to pass it on. */
    const inbound = (data, isBinary) => {
      if (session.kind === "stt") {
        if (isBinary) {
          audioBytes += data.length;
          return true;
        }
        return LISTEN_CONTROL.has(controlType(data));
      }
      if (isBinary) return false;
      let frame;
      try {
        frame = data.length <= 8192 ? JSON.parse(data.toString("utf8")) : null;
      } catch {}
      if (frame?.type === "Speak" && typeof frame.text === "string") {
        if (frame.text.length > config.limits.ttsChars)
          throw new Refusal(
            "request_too_large",
            "That's too much text to speak in the demo.",
          );
        if (!meter.add(budget.cost.tts(frame.text.length)))
          throw new Refusal("insufficient_credit", USED_UP);
        return true;
      }
      return SPEAK_CONTROL.has(frame?.type);
    };

    return new Promise((resolve) => {
      let ended = false;
      let billing = Promise.resolve();

      const closeBoth = (code = 1000, reason = "") => {
        for (const ws of [client, upstream]) {
          try {
            if (ws.readyState === WebSocket.OPEN) ws.close(code, reason);
          } catch {}
        }
      };
      // Deepgram's own shape for an error, so its client logs something useful.
      const fail = (code, message) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(
            JSON.stringify({
              type: "Error",
              code,
              description: message,
              message,
              ...errorBody(code, message),
            }),
          );
        }
        closeBoth(1008, message.slice(0, 120));
      };
      const outOfCredit = async () => {
        const state = await budget.check(installId);
        fail(
          "insufficient_credit",
          !state.ok && state.reason === "day" ? FULL_TODAY : USED_UP,
        );
      };

      /** Count what has accrued and see what's left. */
      const settle = () => {
        billing = billing
          .then(async () => {
            countTime();
            if (!(await meter.settle()) && !ended) await outOfCredit();
          })
          .catch((err) => log("billing_error", { message: err.message }));
        return billing;
      };

      const timer = setInterval(settle, config.limits.meterMs);
      const limit = setTimeout(
        () =>
          fail(
            "session_limit",
            "The demo limits a conversation's length. Start a new one.",
          ),
        config.limits.sessionSeconds * 1000,
      );

      client.on("message", (data, isBinary) => {
        if (ended) return;
        try {
          if (inbound(data, isBinary) && upstream.readyState === WebSocket.OPEN)
            upstream.send(data, { binary: isBinary });
        } catch (err) {
          if (!(err instanceof Refusal)) throw err;
          if (err.code === "insufficient_credit") outOfCredit().catch(() => {});
          else fail(err.code, err.message);
        }
      });
      upstream.on("message", (data, isBinary) => {
        if (client.readyState === WebSocket.OPEN)
          client.send(data, { binary: isBinary });
      });

      const onClose = () => {
        if (ended) return;
        ended = true;
        clearInterval(timer);
        clearTimeout(limit);
        closeBoth();
        settle().finally(resolve);
      };
      client.on("close", onClose);
      upstream.on("close", onClose);
      client.on("error", onClose);
      upstream.on("error", onClose);
    });
  }

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const { pathname } = url;
      if (req.method === "GET" && pathname === "/healthz")
        return sendJson(res, 200, { ok: true, open: slots.counts() });
      if (req.method === "POST" && pathname === "/claim")
        return await claim(req, res);
      if (req.method === "POST" && pathname === "/v1/chat/completions")
        return await chat(req, res);
      if (req.method === "POST" && pathname === "/v1/speak")
        return await speak(req, res, url);
      throw new HttpError(404, "not_found", "The demo doesn't offer that.");
    } catch (err) {
      if (err instanceof HttpError) return sendError(res, err);
      log("error", { message: err.message });
      sendJson(
        res,
        500,
        errorBody("internal_error", "Something went wrong in the demo.", true),
      );
    }
  });
  server.requestTimeout = 60_000;
  server.on("upgrade", (req, socket, head) => {
    upgrade(req, socket, head).catch((err) => {
      log("upgrade_error", { message: err.message });
      socket.destroy();
    });
  });

  return {
    server,
    budget,
    slots,
    listen: (port, host) =>
      new Promise((resolve) =>
        server.listen(port, host, () => resolve(server.address().port)),
      ),
    close: async () => {
      for (const ws of wss.clients) ws.terminate();
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function defaultLog(event, fields = {}) {
  console.log(
    JSON.stringify({ time: new Date().toISOString(), event, ...fields }),
  );
}
