import assert from "node:assert/strict";
import { test } from "node:test";
import { memoryStore } from "../src/store.mjs";
import { credential, issueToken, verifyToken } from "../src/token.mjs";

const SECRET = "k".repeat(40);

test("a token verifies, and each is a different install", () => {
  const a = issueToken(SECRET);
  const b = issueToken(SECRET);
  const idA = verifyToken(SECRET, a, { ttlDays: 30 });
  assert.match(idA, /^[0-9a-f]{24}$/);
  assert.notEqual(idA, verifyToken(SECRET, b, { ttlDays: 30 }));
});

test("a token is refused if altered, forged, from another secret, or expired", () => {
  const token = issueToken(SECRET);
  assert.equal(verifyToken("x".repeat(40), token, { ttlDays: 30 }), null);
  assert.equal(verifyToken(SECRET, `${token}.extra`, { ttlDays: 30 }), null);
  assert.equal(
    verifyToken(SECRET, token.replace("sk_demo_", "sk_live_"), { ttlDays: 30 }),
    null,
  );
  assert.equal(verifyToken(SECRET, "sk_demo_", { ttlDays: 30 }), null);
  assert.equal(verifyToken(SECRET, undefined, { ttlDays: 30 }), null);
  const [payload] = token.slice("sk_demo_".length).split(".");
  assert.equal(
    verifyToken(SECRET, `sk_demo_${payload}.AAAA`, { ttlDays: 30 }),
    null,
  );

  const old = issueToken(SECRET, { now: Date.now() - 31 * 86400_000 });
  assert.equal(verifyToken(SECRET, old, { ttlDays: 30 }), null);
  assert.ok(verifyToken(SECRET, old, { ttlDays: 40 }));
});

test("credential reads an Authorization header, Bearer (OpenRouter) or Token (Deepgram)", () => {
  assert.equal(credential("Bearer abc"), "abc");
  assert.equal(credential("bearer abc"), "abc");
  assert.equal(credential("Token abc"), "abc");
  assert.equal(credential("Basic abc"), null);
  assert.equal(credential("Token"), null);
  assert.equal(credential(undefined), null);
});

test("the memory store counts and expires", async () => {
  let clock = 1000;
  const store = memoryStore({ now: () => clock });
  assert.equal(await store.get("a"), 0);
  assert.equal(await store.incr("a", 5, 10), 5);
  assert.equal(await store.incr("a", -2, 10), 3);
  clock += 9000;
  assert.equal(await store.get("a"), 3);
  clock += 2000;
  assert.equal(await store.get("a"), 0);
  assert.equal(await store.incr("a", 1, 10), 1);
});
