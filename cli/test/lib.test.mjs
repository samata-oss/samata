import assert from "node:assert/strict";
import dgram from "node:dgram";
import net from "node:net";
import { test } from "node:test";
import {
  COMPOSE_PROJECT,
  checkSpekoKey,
  composeUrl,
  findFreePort,
  generateEnv,
  getEnvVar,
  isPortFree,
  isUdpPortFree,
  looksLikeCompose,
  looksLikeSpekoKey,
  parseVersion,
  pickTestStack,
  setEnvVar,
  versionAtLeast,
} from "../src/lib.mjs";

test("composeUrl points at the local compose file", () => {
  assert.equal(
    composeUrl(),
    "https://raw.githubusercontent.com/samata-oss/samata/main/deploy/docker-compose.local.yml",
  );
  assert.equal(
    composeUrl({ repo: "me/fork", ref: "v1.2.3" }),
    "https://raw.githubusercontent.com/me/fork/v1.2.3/deploy/docker-compose.local.yml",
  );
});

test("generateEnv sets every variable the compose file requires", () => {
  const env = generateEnv({ port: 3100 });
  for (const key of [
    "POSTGRES_PASSWORD",
    "SAMATA_WEBHOOK_SECRET",
    "BETTER_AUTH_SECRET",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
  ]) {
    assert.ok(getEnvVar(env, key), `${key} is set`);
  }
  assert.equal(getEnvVar(env, "SAMATA_PORT"), "3100");
  // Secrets are 32 random bytes in hex, and different every time.
  assert.match(getEnvVar(env, "BETTER_AUTH_SECRET"), /^[0-9a-f]{64}$/);
  assert.notEqual(
    getEnvVar(env, "BETTER_AUTH_SECRET"),
    getEnvVar(generateEnv(), "BETTER_AUTH_SECRET"),
  );
  // LiveKit rejects secrets under 32 characters.
  assert.ok(getEnvVar(env, "LIVEKIT_API_SECRET").length >= 32);
});

test("commented-out defaults are not read as values", () => {
  assert.equal(getEnvVar(generateEnv(), "SAMATA_VERSION"), undefined);
});

test("setEnvVar replaces an existing line or appends", () => {
  assert.equal(setEnvVar("A=1\nB=2\n", "B", 3), "A=1\nB=3\n");
  assert.equal(setEnvVar("A=1\n", "B", 2), "A=1\nB=2\n");
  assert.equal(setEnvVar("A=1", "B", 2), "A=1\nB=2\n");
  assert.equal(setEnvVar("", "B", 2), "B=2\n");
  // Only whole keys match.
  assert.equal(setEnvVar("XB=1\n", "B", 2), "XB=1\nB=2\n");
});

test("version comparison", () => {
  assert.deepEqual(parseVersion("v2.40.0-desktop.1"), [2, 40, 0]);
  assert.equal(parseVersion("nonsense"), null);
  assert.ok(versionAtLeast("2.20.0", "2.20.0"));
  assert.ok(versionAtLeast("5.4.0", "2.20.0"));
  assert.ok(versionAtLeast("2.21", "2.20.0"));
  assert.ok(!versionAtLeast("2.19.9", "2.20.0"));
  assert.ok(!versionAtLeast("1.29.2", "2.20.0"));
  assert.ok(!versionAtLeast("", "2.20.0"));
});

test("looksLikeCompose", () => {
  assert.ok(looksLikeCompose("name: x\nservices:\n  a:\n    image: b\n"));
  assert.ok(!looksLikeCompose("<html>404: Not Found</html>"));
  assert.ok(!looksLikeCompose("404: Not Found"));
});

test("isPortFree sees a listening port", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  assert.equal(await isPortFree(port), false);
  await new Promise((resolve) => server.close(resolve));
  assert.equal(await isPortFree(port), true);
});

test("findFreePort skips ports in use", async () => {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, resolve));
  const { port } = server.address();
  const free = await findFreePort(port);
  assert.ok(free > port);
  assert.equal(await isPortFree(free), true);
  await new Promise((resolve) => server.close(resolve));
});

test("generateEnv keeps the Speko key out unless one is given", () => {
  assert.equal(getEnvVar(generateEnv(), "SPEKO_API_KEY"), undefined);
  const key = "sk_speko_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG";
  assert.equal(
    getEnvVar(generateEnv({ spekoKey: key }), "SPEKO_API_KEY"),
    key,
  );
});

test("looksLikeSpekoKey catches mis-pastes", () => {
  assert.ok(looksLikeSpekoKey("sk_speko_abcdefghijklmnopqrstuvwxyz0123456789ABCDEFG"));
  assert.ok(looksLikeSpekoKey("sk_live_92a21d9a7fc1sgdfsdfg"));
  assert.ok(looksLikeSpekoKey("  sk_speko_abcdefghijklmnopqrstuvwxyz_-0123  "));
  assert.ok(!looksLikeSpekoKey(""));
  assert.ok(!looksLikeSpekoKey("sk_speko_short"));
  assert.ok(!looksLikeSpekoKey("sk-abcdefghijklmnopqrstuvwxyz0123456789"));
  assert.ok(!looksLikeSpekoKey("sk_speko_abcdefghijklmnop qrstuvwxyz"));
  assert.ok(
    !looksLikeSpekoKey("SPEKO_API_KEY=sk_speko_abcdefghijklmnopqrstuvwxyz"),
  );
});

test("checkSpekoKey only calls a key invalid when Speko says so", async () => {
  const reply = (status) => async () => ({ ok: status < 300, status });
  assert.equal(await checkSpekoKey("k", { fetchImpl: reply(200) }), "valid");
  assert.equal(await checkSpekoKey("k", { fetchImpl: reply(401) }), "invalid");
  assert.equal(await checkSpekoKey("k", { fetchImpl: reply(429) }), "unknown");
  assert.equal(await checkSpekoKey("k", { fetchImpl: reply(503) }), "unknown");
  const offline = async () => {
    throw new TypeError("fetch failed");
  };
  assert.equal(await checkSpekoKey("k", { fetchImpl: offline }), "unknown");
});

test("pickTestStack picks distinct free ports and a project of its own", async () => {
  const { dashboard, env } = await pickTestStack();
  const ports = [
    dashboard,
    env.SAMATA_LIVEKIT_PORT,
    env.SAMATA_LIVEKIT_TCP_PORT,
    env.SAMATA_LIVEKIT_UDP_PORT,
  ];
  assert.equal(new Set(ports).size, 4);
  for (const port of ports) assert.ok(port > 10000, `${port} is far from the defaults`);
  assert.match(env.COMPOSE_PROJECT_NAME, /^samata-test-[0-9a-f]{6}$/);
  assert.notEqual(env.COMPOSE_PROJECT_NAME, COMPOSE_PROJECT);
});

test("generateEnv writes the extra test-stack settings", () => {
  const env = generateEnv({ extra: { COMPOSE_PROJECT_NAME: "samata-test-abc123", SAMATA_LIVEKIT_PORT: 17880 } });
  assert.equal(getEnvVar(env, "COMPOSE_PROJECT_NAME"), "samata-test-abc123");
  assert.equal(getEnvVar(env, "SAMATA_LIVEKIT_PORT"), "17880");
  assert.equal(getEnvVar(generateEnv(), "COMPOSE_PROJECT_NAME"), undefined);
});

test("isUdpPortFree sees a bound UDP port", async () => {
  const socket = dgram.createSocket("udp4");
  await new Promise((resolve) => socket.bind(0, resolve));
  const { port } = socket.address();
  assert.equal(await isUdpPortFree(port), false);
  await new Promise((resolve) => socket.close(resolve));
  assert.equal(await isUdpPortFree(port), true);
});
