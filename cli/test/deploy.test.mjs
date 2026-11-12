import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  assessServer,
  buildEnv,
  changedDataSecrets,
  checkIdentityFile,
  classifySshFailure,
  detectCloud,
  dnsProblems,
  FIREWALL_TCP,
  FIREWALL_UDP,
  expandHome,
  generateProdEnv,
  getEnvVar,
  imagePrefixFor,
  isHostname,
  isIPv4,
  isPrivateIPv4,
  mergeEnv,
  parseEnvFile,
  parseHost,
  parseProbe,
  productionComposeUrl,
  setEnvVar,
  sshFailureMessage,
  sslipDomains,
} from "../src/lib.mjs";
import {
  Ssh,
  chooseDomains,
  dnsFixMessage,
  firewallSummary,
  renderSummary,
} from "../src/deploy.mjs";
import { INSTALL_SCRIPT, PROBE_SCRIPT } from "../src/remote.mjs";

test("parseHost splits user and host, and refuses anything that could be an ssh option", () => {
  assert.deepEqual(parseHost("ubuntu@203.0.113.7"), {
    user: "ubuntu",
    host: "203.0.113.7",
  });
  assert.deepEqual(parseHost("ec2-1-2-3-4.compute-1.amazonaws.com"), {
    user: undefined,
    host: "ec2-1-2-3-4.compute-1.amazonaws.com",
  });
  assert.deepEqual(parseHost("my_alias"), {
    user: undefined,
    host: "my_alias",
  });
  assert.throws(() => parseHost(undefined), /--host/);
  assert.throws(() => parseHost("-oProxyCommand=evil"), /valid hostname/);
  assert.throws(() => parseHost("me@-oProxyCommand=evil"), /valid hostname/);
  assert.throws(() => parseHost("-bad@host"), /valid SSH user/);
  assert.throws(() => parseHost("host:2222"), /--ssh-port/);
  assert.throws(() => parseHost("a b@host"), /valid SSH user/);
  assert.throws(() => parseHost("host; rm -rf /"), /valid hostname/);
});

test("expandHome", () => {
  assert.equal(expandHome("~/key.pem", "/home/me"), "/home/me/key.pem");
  assert.equal(expandHome("~", "/home/me"), "/home/me");
  assert.equal(expandHome("/abs/key.pem", "/home/me"), "/abs/key.pem");
  assert.equal(expandHome("rel/~/key.pem", "/home/me"), "rel/~/key.pem");
});

test("checkIdentityFile catches what ssh reports cryptically", () => {
  const ok = {
    file: "k.pem",
    exists: true,
    mode: 0o100400,
    platform: "darwin",
  };
  assert.equal(checkIdentityFile(ok), null);
  assert.equal(checkIdentityFile({ ...ok, mode: 0o100600 }), null);
  assert.match(checkIdentityFile({ ...ok, exists: false }), /doesn't exist/);
  // AWS downloads .pem files as 0644 on some systems: ssh refuses them.
  assert.match(
    checkIdentityFile({ ...ok, mode: 0o100644 }),
    /chmod 400 k\.pem/,
  );
  assert.match(checkIdentityFile({ ...ok, mode: 0o100660 }), /chmod 400/);
  assert.match(checkIdentityFile({ ...ok, file: "k.ppk" }), /puttygen/);
  // No Unix permissions to check on Windows.
  assert.equal(
    checkIdentityFile({ ...ok, mode: 0o100666, platform: "win32" }),
    null,
  );
});

test("classifySshFailure", () => {
  const kind = (s) => classifySshFailure(s).kind;
  assert.equal(kind("ubuntu@1.2.3.4: Permission denied (publickey)."), "auth");
  assert.equal(
    kind(
      "Received disconnect from 1.2.3.4 port 22:2: Too many authentication failures",
    ),
    "too-many-keys",
  );
  assert.equal(
    kind("ssh: connect to host 1.2.3.4 port 22: Operation timed out"),
    "timeout",
  );
  assert.equal(
    kind("ssh: connect to host 1.2.3.4 port 22: Connection timed out"),
    "timeout",
  );
  assert.equal(
    kind("ssh: connect to host 1.2.3.4 port 22: Connection refused"),
    "refused",
  );
  assert.equal(
    kind("ssh: Could not resolve hostname nope: Name or service not known"),
    "resolve",
  );
  assert.equal(
    kind("ssh: connect to host x port 22: No route to host"),
    "unreachable",
  );
  assert.equal(
    kind(
      "@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@\nHost key verification failed.",
    ),
    "host-key-changed",
  );
  assert.equal(kind('Load key "k.pem": invalid format'), "key-format");
  assert.equal(
    kind(
      "Permissions 0644 for 'k' are too open.\nUNPROTECTED PRIVATE KEY FILE!",
    ),
    "key-permissions",
  );
  assert.equal(
    kind('Load key "k": incorrect passphrase supplied to decrypt private key'),
    "key-passphrase",
  );
  assert.equal(kind("something odd"), "unknown");

  // AWS's authorized_keys tells root which user to use, on stdout.
  assert.deepEqual(
    classifySshFailure(
      'Please login as the user "ubuntu" rather than the user "root".\n',
    ),
    { kind: "wrong-user", suggested: "ubuntu" },
  );
});

test("sshFailureMessage tells AWS users about the key pair and the security group", () => {
  const noKey = sshFailureMessage({
    kind: "auth",
    user: "ubuntu",
    host: "1.2.3.4",
  });
  assert.match(noKey, /\.pem/);
  assert.match(noKey, /-i /);
  assert.match(noKey, /ec2-user/);

  const withKey = sshFailureMessage({
    kind: "auth",
    user: "ubuntu",
    host: "1.2.3.4",
    identity: "/k.pem",
  });
  assert.match(withKey, /launched with/);
  assert.doesNotMatch(withKey, /No key given/);

  const probed = sshFailureMessage({
    kind: "auth",
    host: "1.2.3.4",
    tried: ["ubuntu", "ec2-user"],
  });
  assert.match(probed, /ubuntu, ec2-user/);

  assert.match(
    sshFailureMessage({ kind: "timeout", host: "1.2.3.4" }),
    /security group/,
  );
  assert.match(
    sshFailureMessage({ kind: "timeout", host: "1.2.3.4" }),
    /Elastic IP/,
  );
  assert.match(
    sshFailureMessage({ kind: "host-key-changed", host: "1.2.3.4" }),
    /ssh-keygen -R 1\.2\.3\.4/,
  );
  // known_hosts files key non-standard ports as [host]:port.
  assert.match(
    sshFailureMessage({
      kind: "host-key-changed",
      host: "1.2.3.4",
      port: 2222,
    }),
    /ssh-keygen -R "\[1\.2\.3\.4\]:2222"/,
  );
  assert.match(
    sshFailureMessage({
      kind: "wrong-user",
      suggested: "ubuntu",
      host: "1.2.3.4",
    }),
    /--host ubuntu@1\.2\.3\.4/,
  );
  assert.match(sshFailureMessage({ kind: "too-many-keys", host: "h" }), /-i/);
});

test("a server that offers a password gets the ssh-copy-id fix, not the AWS advice", () => {
  // Hetzner without an SSH key: sshd still lists password as a way in.
  const keyOnly = classifySshFailure("root@1.2.3.4: Permission denied (publickey).");
  assert.deepEqual(keyOnly, { kind: "auth", passwordOffered: false });
  for (const methods of ["publickey,password", "publickey,keyboard-interactive"]) {
    assert.deepEqual(
      classifySshFailure(`root@1.2.3.4: Permission denied (${methods}).`),
      { kind: "auth", passwordOffered: true },
    );
  }

  const msg = sshFailureMessage({
    kind: "auth",
    passwordOffered: true,
    host: "1.2.3.4",
    tried: ["root", "ubuntu"],
  });
  assert.match(msg, /ssh-copy-id root@1\.2\.3\.4/);
  assert.match(msg, /never passwords/);
  assert.doesNotMatch(msg, /\.pem|ec2-user/);

  // A given user and key are respected.
  const given = sshFailureMessage({
    kind: "auth",
    passwordOffered: true,
    user: "admin",
    host: "1.2.3.4",
    identity: "/k/id_ed25519",
  });
  assert.match(given, /ssh-copy-id -i \/k\/id_ed25519\.pub admin@1\.2\.3\.4/);

  // Key-only servers (AWS) keep the existing advice.
  assert.match(
    sshFailureMessage({ kind: "auth", host: "1.2.3.4", passwordOffered: false }),
    /\.pem/,
  );
});

test("detectCloud reads the hardware strings", () => {
  assert.equal(
    detectCloud("Amazon EC2 m5.large Amazon EC2 Amazon EC2 ").id,
    "aws",
  );
  assert.equal(
    detectCloud("Google Google Compute Engine Google Google ").id,
    "gcp",
  );
  assert.equal(
    detectCloud("Microsoft Corporation Virtual Machine ").id,
    "azure",
  );
  assert.equal(detectCloud("Hetzner vServer Hetzner ").id, "hetzner");
  assert.equal(
    detectCloud("DigitalOcean Droplet DigitalOcean ").id,
    "digitalocean",
  );
  assert.equal(detectCloud("QEMU Standard PC ").id, "unknown");
  assert.equal(detectCloud(undefined).id, "unknown");
  assert.equal(detectCloud("Amazon EC2").firewall, "security group");
});

test("addresses", () => {
  assert.ok(isIPv4("203.0.113.7"));
  assert.ok(!isIPv4("256.1.1.1"));
  assert.ok(!isIPv4("1.2.3"));
  assert.ok(!isIPv4("host.example.com"));
  for (const ip of [
    "10.0.0.5",
    "172.16.0.1",
    "172.31.255.1",
    "192.168.1.1",
    "127.0.0.1",
    "100.64.0.1",
  ]) {
    assert.ok(isPrivateIPv4(ip), ip);
  }
  for (const ip of [
    "203.0.113.7",
    "172.15.0.1",
    "172.32.0.1",
    "8.8.8.8",
    "100.128.0.1",
  ]) {
    assert.ok(!isPrivateIPv4(ip), ip);
  }
  assert.deepEqual(sslipDomains("203.0.113.7"), {
    domain: "203-0-113-7.sslip.io",
    livekitDomain: "livekit.203-0-113-7.sslip.io",
  });
  assert.ok(isHostname("samata.example.com"));
  assert.ok(isHostname("a-b.example.co.uk"));
  assert.ok(!isHostname("localhost"));
  assert.ok(!isHostname("https://x.com"));
  assert.ok(!isHostname("-bad.example.com"));
  assert.ok(!isHostname("a b.example.com"));
});

test("dnsProblems", () => {
  const ip = "203.0.113.7";
  assert.deepEqual(dnsProblems(ip, { a: [ip], b: [ip] }), []);
  assert.deepEqual(dnsProblems(ip, { a: [ip, "198.51.100.1"] }), []);
  assert.deepEqual(dnsProblems(ip, { a: [], b: ["198.51.100.1"] }), [
    { name: "a", found: [] },
    { name: "b", found: ["198.51.100.1"] },
  ]);
});

test("generateProdEnv sets every variable the production compose file requires", () => {
  const env = generateProdEnv({
    domain: "samata.example.com",
    livekitDomain: "livekit.example.com",
    imagePrefix: "ghcr.io/samata-oss",
  });
  for (const key of [
    "SAMATA_IMAGE_PREFIX",
    "SAMATA_DOMAIN",
    "LIVEKIT_DOMAIN",
    "POSTGRES_PASSWORD",
    "SAMATA_WEBHOOK_SECRET",
    "BETTER_AUTH_SECRET",
    "LIVEKIT_API_KEY",
    "LIVEKIT_API_SECRET",
  ]) {
    assert.ok(getEnvVar(env, key), `${key} is set`);
  }
  assert.equal(getEnvVar(env, "SAMATA_VERSION"), undefined);
  assert.match(getEnvVar(env, "BETTER_AUTH_SECRET"), /^[0-9a-f]{64}$/);
  assert.notEqual(
    getEnvVar(env, "POSTGRES_PASSWORD"),
    getEnvVar(
      generateProdEnv({
        domain: "a.b.co",
        livekitDomain: "c.b.co",
        imagePrefix: "x",
      }),
      "POSTGRES_PASSWORD",
    ),
  );
  const pinned = generateProdEnv({
    domain: "a.b.co",
    livekitDomain: "c.b.co",
    imagePrefix: "x",
    version: "0.1.0",
  });
  assert.equal(getEnvVar(pinned, "SAMATA_VERSION"), "0.1.0");
});

test("a production env never contains the local quickstart's port", () => {
  const env = generateProdEnv({
    domain: "a.b.co",
    livekitDomain: "c.b.co",
    imagePrefix: "x",
  });
  assert.equal(getEnvVar(env, "SAMATA_PORT"), undefined);
});

test("parseEnvFile", () => {
  assert.deepEqual(
    parseEnvFile("# c\n\nA=1\nexport B=two words\r\nC=\nD=a=b\n"),
    { A: "1", B: "two words", C: "", D: "a=b" },
  );
  assert.throws(() => parseEnvFile("A=1\nnot a pair\n"), /Line 2/);
  assert.throws(() => parseEnvFile("1A=x"), /Line 1/);
});

test("setEnvVar and mergeEnv keep `$` in values literal", () => {
  assert.equal(setEnvVar("A=1\n", "A", "p$&ss$1"), "A=p$&ss$1\n");
  assert.equal(mergeEnv("A=1\n", { A: "$$x", B: "2" }), "A=$$x\nB=2\n");
});

test("buildEnv: new server gets secrets, existing keeps them", () => {
  const base = {
    domain: "samata.example.com",
    livekitDomain: "livekit.example.com",
    imagePrefix: "ghcr.io/samata-oss",
  };
  const fresh = buildEnv({ ...base, extraVars: { SAMATA_CLOUD: "1" } });
  assert.equal(getEnvVar(fresh, "SAMATA_CLOUD"), "1");
  assert.ok(getEnvVar(fresh, "POSTGRES_PASSWORD"));

  const again = buildEnv({
    ...base,
    existing: fresh,
    domain: "other.example.com",
    livekitDomain: "livekit.other.example.com",
    version: "0.2.0",
  });
  assert.equal(
    getEnvVar(again, "POSTGRES_PASSWORD"),
    getEnvVar(fresh, "POSTGRES_PASSWORD"),
  );
  assert.equal(
    getEnvVar(again, "BETTER_AUTH_SECRET"),
    getEnvVar(fresh, "BETTER_AUTH_SECRET"),
  );
  assert.equal(getEnvVar(again, "SAMATA_DOMAIN"), "other.example.com");
  assert.equal(getEnvVar(again, "SAMATA_VERSION"), "0.2.0");
  assert.equal(getEnvVar(again, "SAMATA_CLOUD"), "1");

  // A hand-written .env without an image prefix gets one; one with it is left alone.
  const bare = buildEnv({ ...base, existing: "POSTGRES_PASSWORD=x\n" });
  assert.equal(getEnvVar(bare, "SAMATA_IMAGE_PREFIX"), "ghcr.io/samata-oss");
  const custom = buildEnv({
    ...base,
    existing: "SAMATA_IMAGE_PREFIX=ghcr.io/me\n",
  });
  assert.equal(getEnvVar(custom, "SAMATA_IMAGE_PREFIX"), "ghcr.io/me");
});

test("changedDataSecrets protects data on re-deploys", () => {
  const existing = "POSTGRES_PASSWORD=a\nBETTER_AUTH_SECRET=b\n";
  assert.deepEqual(changedDataSecrets(existing, { POSTGRES_PASSWORD: "z" }), [
    "POSTGRES_PASSWORD",
  ]);
  assert.deepEqual(
    changedDataSecrets(existing, { POSTGRES_PASSWORD: "a" }),
    [],
  );
  assert.deepEqual(
    changedDataSecrets(existing, { STRIPE_SECRET_KEY: "sk" }),
    [],
  );
  // First time setting an encryption key isn't "changing" one.
  assert.deepEqual(
    changedDataSecrets(existing, { SAMATA_ENCRYPTION_KEY: "k" }),
    [],
  );
});

test("imagePrefixFor and productionComposeUrl", () => {
  assert.equal(imagePrefixFor(), "ghcr.io/samata-oss");
  assert.equal(imagePrefixFor("Me/Fork"), "ghcr.io/me");
  assert.equal(
    productionComposeUrl(),
    "https://raw.githubusercontent.com/samata-oss/samata/main/deploy/docker-compose.yml",
  );
  assert.equal(
    productionComposeUrl({ repo: "me/fork", ref: "v1.0.0" }),
    "https://raw.githubusercontent.com/me/fork/v1.0.0/deploy/docker-compose.yml",
  );
});

test("parseProbe ignores everything but our lines", () => {
  const out = [
    "Welcome to Ubuntu",
    "samata:user=ubuntu",
    "samata:dmi=Amazon EC2 t3.small ",
    "samata:busy_ports=80 443",
    "noise=1",
  ].join("\n");
  assert.deepEqual(parseProbe(out), {
    user: "ubuntu",
    dmi: "Amazon EC2 t3.small",
    busy_ports: "80 443",
  });
});

const GB = 1024 * 1024;
const healthy = {
  user: "ubuntu",
  os_id: "ubuntu",
  arch: "x86_64",
  mem_kb: String(4 * GB),
  disk_kb: String(30 * GB),
  docker_cli: "1",
  docker_server: "27.3.1",
  compose: "2.29.7",
  running: "0",
  env_exists: "0",
  busy_ports: "",
};

test("assessServer: a healthy server needs nothing", () => {
  assert.deepEqual(assessServer(healthy), {
    errors: [],
    warnings: [],
    needs: { docker: false, composePlugin: false },
  });
});

test("assessServer: a bare Ubuntu or Amazon Linux box needs Docker", () => {
  const bare = {
    ...healthy,
    docker_cli: undefined,
    docker_server: undefined,
    compose: undefined,
  };
  const ubuntu = assessServer(bare);
  assert.deepEqual(ubuntu.errors, []);
  assert.deepEqual(ubuntu.needs, { docker: true, composePlugin: false });

  // Amazon Linux's Docker has no Compose plugin, so it's installed alongside.
  const amzn = assessServer({ ...bare, os_id: "amzn" });
  assert.deepEqual(amzn.errors, []);
  assert.deepEqual(amzn.needs, { docker: true, composePlugin: true });

  const rocky = assessServer({ ...bare, os_id: "rocky" });
  assert.match(rocky.errors[0], /Ubuntu, Debian and Amazon Linux/);
});

test("assessServer: Docker present but Compose missing or too old", () => {
  assert.deepEqual(assessServer({ ...healthy, compose: "" }).needs, {
    docker: false,
    composePlugin: true,
  });
  assert.deepEqual(
    assessServer({ ...healthy, compose: "2.19.0" }).needs.composePlugin,
    true,
  );
  assert.deepEqual(
    assessServer({ ...healthy, compose: "2.20.0" }).needs.composePlugin,
    false,
  );
});

test("assessServer: the usual small-instance problems", () => {
  const small = assessServer({
    ...healthy,
    mem_kb: String(1 * GB),
    disk_kb: String(3 * GB),
  });
  assert.equal(small.warnings.length, 2);
  assert.match(small.warnings[0], /t3\.medium/);
  assert.match(small.warnings[1], /20 GB/);
  assert.deepEqual(small.errors, []);
});

test("assessServer: stops on sudo, ports, CPU, and a database with no .env", () => {
  assert.match(assessServer({ ...healthy, sudo: "no" }).errors[0], /sudo/);
  assert.match(
    assessServer({ ...healthy, busy_ports: "80 443" }).errors[0],
    /Port 80, 443/,
  );
  assert.match(
    assessServer({ ...healthy, arch: "armv7l" }).errors[0],
    /armv7l/,
  );
  const orphan = assessServer({ ...healthy, volume: "1", env_exists: "0" });
  assert.match(orphan.errors[0], /docker volume rm samata_postgres-data/);
  // With its .env, a database is just a re-deploy.
  assert.deepEqual(
    assessServer({ ...healthy, volume: "1", env_exists: "1" }).errors,
    [],
  );
});

test("assessServer: Docker installed but stopped is started, not reinstalled", () => {
  const stopped = assessServer({
    ...healthy,
    os_id: "rocky",
    docker_server: "",
    compose: "",
  });
  assert.deepEqual(stopped.errors, []);
  assert.equal(stopped.warnings.length, 1);
});

// A syntax error in these would only show up on someone's server.
for (const [name, script] of [
  ["PROBE_SCRIPT", PROBE_SCRIPT],
  ["INSTALL_SCRIPT", INSTALL_SCRIPT],
]) {
  test(`${name} is valid bash`, (t) => {
    const bash = spawnSync("bash", ["--version"]);
    if (bash.status !== 0) return t.skip("no bash");
    const res = spawnSync("bash", ["-n"], { input: script, encoding: "utf8" });
    assert.equal(res.status, 0, res.stderr);
  });
}

test("remote scripts read all of their input before running anything", () => {
  // The last line calls main with stdin closed: a command that reads stdin
  // (apt, docker) must not swallow the rest of a piped script.
  for (const script of [PROBE_SCRIPT, INSTALL_SCRIPT]) {
    assert.match(script.trim(), /\nmain <\/dev\/null$/);
  }
});

test("the probe script runs here and reports what the assessment needs", (t) => {
  const bash = spawnSync("bash", ["--version"]);
  if (bash.status !== 0 || process.platform !== "linux") {
    return t.skip("needs Linux and bash");
  }
  const res = spawnSync("bash", ["-s"], {
    input: PROBE_SCRIPT,
    encoding: "utf8",
  });
  const probe = parseProbe(res.stdout);
  for (const key of [
    "user",
    "os_id",
    "arch",
    "mem_kb",
    "disk_kb",
    "running",
    "env_exists",
    "busy_ports",
  ]) {
    assert.ok(key in probe, `${key} reported`);
  }
});

const awsCloud = { id: "aws", name: "AWS", firewall: "security group" };

test("dnsFixMessage lists the records to add, and the Elastic IP advice on AWS", () => {
  const msg = dnsFixMessage({
    problems: [
      { name: "samata.example.com", found: [] },
      { name: "livekit.samata.example.com", found: ["198.51.100.1"] },
    ],
    serverIp: "203.0.113.7",
    domain: "samata.example.com",
    livekitDomain: "livekit.samata.example.com",
    cloud: awsCloud,
  });
  assert.match(msg, /samata\.example\.com {2}doesn't resolve/);
  assert.match(msg, /points at 198\.51\.100\.1/);
  assert.match(msg, /A {2}samata\.example\.com {2}203\.0\.113\.7/);
  assert.match(msg, /A {2}livekit\.samata\.example\.com {2}203\.0\.113\.7/);
  assert.match(msg, /Elastic IP/);
  assert.match(msg, /--skip-dns-check/);
  assert.doesNotMatch(
    dnsFixMessage({
      problems: [{ name: "a.b.co", found: [] }],
      serverIp: "1.1.1.1",
      domain: "a.b.co",
      livekitDomain: "l.b.co",
      cloud: { id: "unknown", name: "your server", firewall: "firewall" },
    }),
    /Elastic IP/,
  );
});

test("firewallSummary names every port in the compose file and the provider's firewall", () => {
  const out = firewallSummary(awsCloud);
  for (const p of ["80", "443", "7881", "5060", "7882", "10000-10100"]) {
    assert.ok(out.includes(p), p);
  }
  assert.match(out, /security group/);
  assert.doesNotMatch(
    firewallSummary({
      id: "unknown",
      name: "your server",
      firewall: "firewall",
    }),
    /\(/,
  );
});

test("the firewall ports match the production compose file", async () => {
  const { readFile } = await import("node:fs/promises");
  const compose = await readFile(
    new URL("../../deploy/docker-compose.yml", import.meta.url),
    "utf8",
  );
  const published = [
    ...compose.matchAll(
      /^\s+- "(\d+(?:-\d+)?):\d+(?:-\d+)?(?:\/(tcp|udp))?"/gm,
    ),
  ].map((m) => `${m[2] ?? "tcp"}:${m[1]}`);
  const ours = [
    ...FIREWALL_TCP.map((p) => `tcp:${p.port}`),
    ...FIREWALL_UDP.map((p) => `udp:${p.port}`),
  ];
  // Everything the compose file publishes (bar 443/udp, HTTP/3, which is optional) is in our list.
  for (const port of published) {
    if (port === "udp:443") continue;
    assert.ok(
      ours.includes(port),
      `${port} is published by the compose file but not in FIREWALL_*`,
    );
  }
});

test("renderSummary", () => {
  const base = {
    url: "https://samata.example.com",
    domain: "samata.example.com",
    serverIp: "203.0.113.7",
    usingSslip: false,
    cloud: awsCloud,
    target: "ubuntu@203.0.113.7",
    identity: "/home/me/key.pem",
    prefix: "sudo ",
    version: "0.1.0",
  };
  const out = renderSummary(base);
  assert.match(out, /https:\/\/samata\.example\.com/);
  assert.match(out, /first account owns the install/);
  assert.match(out, /ssh ubuntu@203\.0\.113\.7/);
  assert.match(out, /sudo docker compose -p samata logs -f/);
  // The upgrade hint repeats the key, so it works when pasted.
  assert.match(
    out,
    /deploy --host ubuntu@203\.0\.113\.7 -i \/home\/me\/key\.pem/,
  );
  assert.match(out, /security group/);
  assert.doesNotMatch(out, /placeholder/);
  assert.doesNotMatch(out, /edge/);

  const sslip = renderSummary({
    ...base,
    usingSslip: true,
    version: undefined,
    identity: undefined,
    prefix: "",
  });
  assert.match(sslip, /placeholder hostname/);
  assert.match(sslip, /point\s+two hostnames of your own at 203\.0\.113\.7/);
  assert.match(sslip, /edge/);
  assert.doesNotMatch(sslip, / -i /);
  assert.doesNotMatch(sslip, /sudo docker/);
});

test("Ssh passes the key pair and only that key, and addresses the right socket", (t) => {
  const ssh = new Ssh({ host: "1.2.3.4", port: 2200, identity: "/k/aws.pem" });
  t.after(() => ssh.close());
  const args = ssh.baseArgs();
  const joined = args.join(" ");
  assert.match(joined, /-i \/k\/aws\.pem/);
  // Without this, an agent holding several keys makes AWS hang up before the right one.
  assert.match(joined, /IdentitiesOnly=yes/);
  assert.match(joined, /-p 2200/);
  assert.match(joined, /PasswordAuthentication=no/);
  assert.match(joined, /StrictHostKeyChecking=accept-new/);
  if (process.platform !== "win32") {
    const control = args.find((a) => a.startsWith("ControlPath="));
    // A unix socket path is limited to ~104 bytes; %C expands to 40 more.
    assert.ok(control.length - "ControlPath=".length + 40 < 100, control);
  }
  assert.equal(ssh.target("ubuntu"), "ubuntu@1.2.3.4");
  assert.equal(ssh.target(undefined), "1.2.3.4");

  const noKey = new Ssh({ host: "h" });
  t.after(() => noKey.close());
  assert.doesNotMatch(noKey.baseArgs().join(" "), /IdentitiesOnly|-i /);
});

test("chooseDomains: flags, then what the server already has, then sslip.io", () => {
  const pub = { serverIp: "203.0.113.7", hostname: "203.0.113.7" };
  assert.deepEqual(
    chooseDomains({ opts: { domain: "samata.example.com" }, ...pub }),
    {
      domain: "samata.example.com",
      livekitDomain: "livekit.samata.example.com",
      usingSslip: false,
    },
  );
  assert.equal(
    chooseDomains({
      opts: { domain: "samata.example.com", livekitDomain: "lk.example.com" },
      ...pub,
    }).livekitDomain,
    "lk.example.com",
  );
  // A re-run without flags keeps the server's hostnames, whatever they are.
  const existingEnv =
    "SAMATA_DOMAIN=samata.example.com\nLIVEKIT_DOMAIN=lk.example.com\n";
  assert.deepEqual(chooseDomains({ opts: {}, existingEnv, ...pub }), {
    domain: "samata.example.com",
    livekitDomain: "lk.example.com",
    usingSslip: false,
  });
  // ...but a new --domain wins, and its LiveKit name follows it rather than the old one.
  assert.equal(
    chooseDomains({ opts: { domain: "new.example.com" }, existingEnv, ...pub })
      .livekitDomain,
    "livekit.new.example.com",
  );
  // A server that was set up with placeholder names is still on placeholders.
  const placeholder = chooseDomains({
    opts: {},
    existingEnv:
      "SAMATA_DOMAIN=203-0-113-7.sslip.io\nLIVEKIT_DOMAIN=livekit.203-0-113-7.sslip.io\n",
    ...pub,
  });
  assert.equal(placeholder.usingSslip, true);
  // Fresh server on a public address: placeholders need no DNS.
  assert.deepEqual(chooseDomains({ opts: {}, ...pub }), {
    domain: "203-0-113-7.sslip.io",
    livekitDomain: "livekit.203-0-113-7.sslip.io",
    usingSslip: true,
  });
  // Private address (a VPC IP, or a bastion): no public name can point at it.
  assert.throws(
    () =>
      chooseDomains({ opts: {}, serverIp: "10.0.1.5", hostname: "10.0.1.5" }),
    /private address[\s\S]*--domain samata\.example\.com/,
  );
  // ...unless the user brings their own.
  assert.equal(
    chooseDomains({
      opts: { domain: "samata.example.com" },
      serverIp: "10.0.1.5",
      hostname: "10.0.1.5",
    }).usingSslip,
    false,
  );
});
