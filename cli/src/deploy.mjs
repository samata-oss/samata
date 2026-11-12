import { spawn, spawnSync } from "node:child_process";
import dns from "node:dns/promises";
import { existsSync, mkdtempSync, rmSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fetchCompose } from "./compose.mjs";
import {
  DEPLOY_DIR,
  DEPLOY_PROJECT,
  FIREWALL_TCP,
  FIREWALL_UDP,
  SSH_USER_CANDIDATES,
  assessServer,
  buildEnv,
  changedDataSecrets,
  checkIdentityFile,
  classifySshFailure,
  detectCloud,
  dnsProblems,
  expandHome,
  getEnvVar,
  imagePrefixFor,
  isHostname,
  isIPv4,
  isPrivateIPv4,
  parseEnvFile,
  parseHost,
  parseProbe,
  sshFailureMessage,
  sslipDomains,
} from "./lib.mjs";
import { INSTALL_SCRIPT, PROBE_SCRIPT } from "./remote.mjs";
import {
  CMD,
  CliError,
  bold,
  dim,
  green,
  note,
  red,
  run,
  step,
  warn,
  yellow,
} from "./ui.mjs";

/** How long we wait for HTTPS to come up: the first start also fetches a certificate. */
const HEALTH_TIMEOUT_MS = 180_000;

/**
 * An SSH connection to the server. Every call reuses one connection
 * (ControlMaster), so a key passphrase is asked for once, not once per command.
 * Windows' OpenSSH has no ControlMaster; there each call connects on its own.
 */
export class Ssh {
  constructor({ host, port, identity }) {
    this.host = host;
    this.port = port;
    this.identity = identity;
    this.user = undefined;
    this.controlDir = undefined;
    if (process.platform !== "win32") {
      // Short on purpose: a unix socket path is limited to ~104 characters,
      // and macOS's os.tmpdir() is already half of that.
      const base = existsSync("/tmp") ? "/tmp" : os.tmpdir();
      this.controlDir = mkdtempSync(path.join(base, "samata-ssh-"));
    }
  }

  baseArgs() {
    const args = [
      // Trust a server's key the first time we see it (as `ssh` would ask),
      // but refuse if a known one changes.
      "-o",
      "StrictHostKeyChecking=accept-new",
      "-o",
      "ConnectTimeout=15",
      "-o",
      "ServerAliveInterval=20",
      "-o",
      "ServerAliveCountMax=6",
      // Keys only. A password prompt in the middle of a deploy helps nobody.
      "-o",
      "PasswordAuthentication=no",
      "-o",
      "ChallengeResponseAuthentication=no",
      "-o",
      "LogLevel=ERROR",
    ];
    if (this.port) args.push("-p", String(this.port));
    if (this.identity) {
      // IdentitiesOnly: with several keys in an agent, ssh offers them all
      // first and the server hangs up ("Too many authentication failures")
      // before reaching the one we asked for.
      args.push("-i", this.identity, "-o", "IdentitiesOnly=yes");
    }
    if (this.controlDir) {
      args.push(
        "-o",
        "ControlMaster=auto",
        "-o",
        `ControlPath=${this.controlDir}/%C`,
        "-o",
        "ControlPersist=300",
      );
    }
    return args;
  }

  target(user = this.user) {
    return user ? `${user}@${this.host}` : this.host;
  }

  /**
   * Run `command` on the server. `input` goes to its stdin; `stream` shows its
   * output live instead of capturing it. Never rejects.
   */
  exec(command, { input, stream = false, user = this.user } = {}) {
    return new Promise((resolve) => {
      const child = spawn(
        "ssh",
        [...this.baseArgs(), "--", this.target(user), command],
        {
          stdio: [
            input === undefined ? "ignore" : "pipe",
            stream ? "inherit" : "pipe",
            stream ? "inherit" : "pipe",
          ],
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (c) => {
        stdout += c;
      });
      child.stderr?.on("data", (c) => {
        stderr += c;
      });
      child.on("error", (error) =>
        resolve({ code: null, stdout, stderr, error }),
      );
      child.on("close", (code) => resolve({ code, stdout, stderr }));
      if (input !== undefined) {
        child.stdin.on("error", () => {});
        child.stdin.end(input);
      }
    });
  }

  /**
   * Shut the shared connection down and remove its socket folder. Synchronous
   * on purpose: after a failure the bin script exits right after printing the
   * error, which would cut short anything still running.
   */
  close() {
    if (!this.controlDir) return;
    // The socket's name hashes the host, port and user, so the exit request
    // has to carry the same options as the connection that created it.
    spawnSync("ssh", ["-O", "exit", ...this.baseArgs(), "--", this.target()], {
      stdio: "ignore",
      timeout: 5_000,
    });
    try {
      rmSync(this.controlDir, { recursive: true, force: true });
    } catch {}
    this.controlDir = undefined;
  }
}

export async function deploy(opts) {
  console.log(`\n${bold("Samata")} deploy\n`);

  // ---- Check everything we can without touching the network. ----
  const { user, host } = parseHost(opts.host);
  if ((await run("ssh", ["-V"])).error?.code === "ENOENT") {
    throw new CliError(
      "This needs the `ssh` command, which isn't installed. On Windows, turn on the OpenSSH Client optional feature.",
    );
  }

  let identity;
  if (opts.identity) {
    identity = path.resolve(expandHome(opts.identity));
    const exists = existsSync(identity);
    const problem = checkIdentityFile({
      file: identity,
      exists,
      mode: exists ? statSync(identity).mode : 0,
      platform: process.platform,
    });
    if (problem) throw new CliError(problem);
  }

  for (const [flag, value] of [
    ["--domain", opts.domain],
    ["--livekit-domain", opts.livekitDomain],
  ]) {
    if (value !== undefined && !isHostname(value)) {
      throw new CliError(
        `${flag} must be a hostname like samata.example.com (got "${value}").`,
      );
    }
  }
  if (opts.livekitDomain && !opts.domain) {
    throw new CliError("--livekit-domain goes with --domain: pass both.");
  }
  if (opts.domain && opts.domain === opts.livekitDomain) {
    throw new CliError(
      "--domain and --livekit-domain must be different hostnames.",
    );
  }

  let extraVars = {};
  if (opts.envFile) {
    let text;
    try {
      text = await readFile(path.resolve(expandHome(opts.envFile)), "utf8");
    } catch {
      throw new CliError(`Couldn't read the env file ${opts.envFile}.`);
    }
    extraVars = parseEnvFile(text);
    for (const key of ["SAMATA_DOMAIN", "LIVEKIT_DOMAIN"]) {
      if (key in extraVars) {
        throw new CliError(
          `${key} comes from --domain / --livekit-domain, not the env file. Remove it from ${opts.envFile}.`,
        );
      }
    }
  }

  // Download before connecting, so a typo in --ref fails before anything changes.
  step(`Downloading ${bold("docker-compose.yml")}`);
  note(opts.compose);
  const composeText = await fetchCompose(opts.compose);

  // ---- Connect. ----
  const hostname = await resolveHostname(host, opts.sshPort);
  const ssh = new Ssh({ host, port: opts.sshPort, identity });
  try {
    await connect(ssh, { user, host, port: opts.sshPort ?? 22, identity });
    await deployTo(ssh, { ...opts, hostname, composeText, extraVars });
  } finally {
    ssh.close();
  }
}

async function deployTo(ssh, opts) {
  const sudo = "sudo ";
  // ---- Look at the server. ----
  step("Checking the server");
  const probeRun = await ssh.exec("bash -s", { input: PROBE_SCRIPT });
  const probe = parseProbe(probeRun.stdout);
  if (probeRun.code !== 0 || !probe.user) {
    throw new CliError(
      `Couldn't inspect the server over SSH (it needs bash).\n${probeRun.stderr.trim()}`,
    );
  }
  const cloud = detectCloud(probe.dmi);
  const asRoot = probe.user === "root";
  const prefix = asRoot ? "" : sudo;
  const { errors, warnings, needs } = assessServer(probe);
  note(
    `${probe.user}@${ssh.host}: ${cloud.id === "unknown" ? "" : `${cloud.name}, `}${probe.arch}, ${(Number(probe.mem_kb) / 1048576).toFixed(1)} GB memory`,
  );
  for (const w of warnings) warn(w);
  if (errors.length > 0) throw new CliError(errors.join("\n\n"));

  // ---- Work out the hostnames. ----
  const existingEnv =
    probe.env_exists === "1"
      ? (await ssh.exec(`${prefix}cat ${DEPLOY_DIR}/.env`)).stdout
      : undefined;
  const serverIp = await resolveIp(opts.hostname);
  const { domain, livekitDomain, usingSslip } = chooseDomains({
    opts,
    existingEnv,
    serverIp,
    hostname: opts.hostname,
  });

  if (!usingSslip && !opts.skipDnsCheck) {
    await checkDns({ serverIp, domain, livekitDomain, cloud });
  }

  if (existingEnv !== undefined) {
    const changed = changedDataSecrets(existingEnv, opts.extraVars);
    if (changed.length > 0) {
      throw new CliError(
        `${changed.join(", ")} would change on a server that already has data, which would make its database and stored provider keys unreadable. Remove ${changed.length > 1 ? "them" : "it"} from the env file.`,
      );
    }
  }
  const env = buildEnv({
    existing: existingEnv,
    domain,
    livekitDomain,
    imagePrefix: imagePrefixFor(opts.repo),
    version: opts.version,
    extraVars: opts.extraVars,
  });

  // ---- Docker. ----
  if (needs.docker || needs.composePlugin) {
    step(
      needs.docker && probe.docker_cli
        ? "Starting Docker"
        : needs.docker
          ? "Installing Docker (about a minute)"
          : "Installing Docker Compose",
    );
    const install = await ssh.exec("bash -s", {
      input: INSTALL_SCRIPT,
      stream: true,
    });
    if (install.code !== 0) {
      throw new CliError(
        [
          "",
          red("Couldn't set up Docker on the server."),
          "The error is above. Install Docker with the Compose plugin yourself, then run this again:",
          "I'll find it and carry on.",
        ].join("\n"),
      );
    }
  } else {
    step("Docker is ready");
  }

  // ---- Files. ----
  step(
    `Writing ${bold(`${DEPLOY_DIR}/docker-compose.yml`)} and ${bold(".env")}`,
  );
  await must(
    ssh,
    `${prefix}mkdir -p ${DEPLOY_DIR}`,
    "create the install folder",
  );
  await writeRemote(
    ssh,
    prefix,
    `${DEPLOY_DIR}/docker-compose.yml`,
    opts.composeText,
    "644",
  );
  if (existingEnv === undefined) {
    note("Generated new secrets. They stay on the server.");
  } else {
    note("Kept the server's secrets.");
  }
  await writeRemote(ssh, prefix, `${DEPLOY_DIR}/.env`, env, "600");

  // ---- Start. ----
  const compose = `cd ${DEPLOY_DIR} && ${prefix}docker compose -p ${DEPLOY_PROJECT}`;
  step("Pulling images (the first time takes a few minutes)");
  const pull = await ssh.exec(`${compose} pull`, { stream: true });
  if (pull.code !== 0) {
    throw new CliError(
      [
        "",
        red("Couldn't pull the images."),
        "",
        "  • Pull denied or not found? The images may not be published for this release",
        "    yet. Pin one that is with --version-tag, or build your own and set",
        `    SAMATA_IMAGE_PREFIX in ${DEPLOY_DIR}/.env.`,
        "  • Otherwise check the server can reach ghcr.io (outbound HTTPS).",
      ].join("\n"),
    );
  }
  step("Starting Samata");
  const up = await ssh.exec(`${compose} up -d --wait --wait-timeout 300`, {
    stream: true,
  });
  if (up.code !== 0) {
    throw new CliError(
      [
        "",
        red("Samata didn't start."),
        `  See what failed:  ssh ${ssh.target(probe.user)} '${compose} logs --tail 50'`,
      ].join("\n"),
    );
  }

  // ---- Check from the outside, the way a user will reach it. ----
  const url = `https://${domain}`;
  step(`Waiting for ${bold(url)} (the first start fetches a certificate)`);
  const healthy = await waitForHealth(`${url}/api/health`, HEALTH_TIMEOUT_MS);
  if (!healthy) {
    await explainUnreachable(ssh, { serverIp, cloud, compose, url });
    throw new CliError(
      `\nSamata is running on the server, but ${url} isn't answering. See above.`,
    );
  }

  console.log(
    renderSummary({
      url,
      domain,
      serverIp,
      usingSslip,
      cloud,
      target: ssh.target(probe.user),
      identity: ssh.identity,
      prefix,
      version: getEnvVar(env, "SAMATA_VERSION"),
    }),
  );
}

/** What to print once Samata answers. */
export function renderSummary({
  url,
  domain,
  serverIp,
  usingSslip,
  cloud,
  target,
  identity,
  prefix,
  version,
}) {
  const lines = [
    "",
    `${green("✔")} ${bold("Samata is running")}`,
    "",
    `  Dashboard   ${bold(url)}`,
    `  Server      ${target}   ${dim(`(files in ${DEPLOY_DIR})`)}`,
    "",
    bold("Next"),
    `  1. Open the dashboard and sign up now: ${bold("the first account owns the install")}.`,
    "  2. Provider Keys: add your OpenAI (or Deepgram + Cartesia) key.",
    "  3. Create an assistant and talk to it from its Test tab.",
  ];
  if (usingSslip) {
    lines.push(
      "",
      `${yellow("!")} ${domain} is a placeholder hostname that needs no DNS setup. For production, point`,
      `  two hostnames of your own at ${serverIp} and run this again with --domain.`,
    );
  }
  if (!version) {
    lines.push(
      "",
      dim(
        "Running the latest build (edge). Pin a release for production: --version-tag 0.1.0",
      ),
    );
  }
  lines.push(
    "",
    `${bold("Also open")} ${dim("(these can't be tested from here; without them calls have no audio)")}`,
    firewallSummary(cloud),
    "",
    bold("Manage"),
    `  ssh ${target}`,
    `  cd ${DEPLOY_DIR} && ${prefix}docker compose -p ${DEPLOY_PROJECT} logs -f   ${dim("# watch it work")}`,
    `  ${dim(`${CMD} deploy --host ${target}${identity ? ` -i ${identity}` : ""}   # upgrade: pulls the latest images, keeps your data`)}`,
    "",
  );
  return lines.join("\n");
}

/** ssh's own view of where `host` goes, so a ~/.ssh/config alias resolves to its real address. */
async function resolveHostname(host, port) {
  const res = await run("ssh", [
    "-G",
    ...(port ? ["-p", String(port)] : []),
    "--",
    host,
  ]);
  const line = res.stdout.split("\n").find((l) => l.startsWith("hostname "));
  return line ? line.slice("hostname ".length).trim() : host;
}

async function resolveIp(hostname) {
  if (isIPv4(hostname)) return hostname;
  try {
    const [ip] = await dns.resolve4(hostname);
    if (ip) return ip;
  } catch {}
  throw new CliError(
    `Couldn't find an IPv4 address for ${hostname}. Use the server's public IPv4 address as the host.`,
  );
}

/**
 * Connect, trying the likely logins when no user was given. Leaves the
 * connection open on `ssh`, with `ssh.user` set to the one that worked.
 */
async function connect(ssh, { user, host, port, identity }) {
  // Without a user: first whatever ssh would do (~/.ssh/config, your own
  // user name), then the logins of the common server images.
  const attempts = user ? [user] : [undefined, ...SSH_USER_CANDIDATES];
  const tried = [];
  let last;
  for (const candidate of attempts) {
    if (!user) {
      note(candidate ? `Trying ${candidate}@${host}` : `Connecting to ${host}`);
    } else {
      step(`Connecting to ${bold(`${user}@${host}`)}`);
    }
    const res = await ssh.exec("echo samata-ok", { user: candidate });
    if (res.error?.code === "ENOENT") {
      throw new CliError("The `ssh` command isn't installed.");
    }
    if (res.code === 0 && res.stdout.includes("samata-ok")) {
      ssh.user = candidate;
      if (!user)
        step(`Connected as ${bold(candidate ? `${candidate}@${host}` : host)}`);
      return;
    }
    const output = `${res.stdout}\n${res.stderr}`;
    last = { ...classifySshFailure(output), detail: res.stderr };
    tried.push(candidate ?? "your default user");
    // Only a refused login is worth another user; anything else won't change.
    const retry = !user && ["auth", "wrong-user"].includes(last.kind);
    if (!retry) break;
  }
  // Trying every login and being refused by all is just "auth".
  const kind = !user && last.kind === "wrong-user" ? "auth" : last.kind;
  throw new CliError(
    sshFailureMessage({
      ...last,
      kind,
      user,
      host,
      port,
      identity,
      tried: user ? [] : tried.filter((t) => t !== "your default user"),
    }),
  );
}

/** Pick hostnames: flags win, then what's already on the server, then sslip.io. */
export function chooseDomains({ opts, existingEnv, serverIp, hostname }) {
  const existingDomain = existingEnv && getEnvVar(existingEnv, "SAMATA_DOMAIN");
  const existingLivekit =
    existingEnv && getEnvVar(existingEnv, "LIVEKIT_DOMAIN");

  if (opts.domain) {
    const livekitDomain = opts.livekitDomain ?? `livekit.${opts.domain}`;
    return { domain: opts.domain, livekitDomain, usingSslip: false };
  }
  if (existingDomain && existingLivekit) {
    const sslip = /\.sslip\.io$/.test(existingDomain);
    return {
      domain: existingDomain,
      livekitDomain: existingLivekit,
      usingSslip: sslip,
    };
  }
  if (isPrivateIPv4(serverIp)) {
    throw new CliError(
      [
        `${hostname} resolves to ${serverIp}, a private address, so a placeholder hostname won't work.`,
        "Pass the hostnames people will reach it by, each with a DNS A record:",
        "",
        `  ${CMD} deploy --host ${hostname} --domain samata.example.com`,
      ].join("\n"),
    );
  }
  return { ...sslipDomains(serverIp), usingSslip: true };
}

/** Caddy can only get certificates for names that already point at the server. */
async function checkDns({ serverIp, domain, livekitDomain, cloud }) {
  if (isPrivateIPv4(serverIp)) {
    note(
      `${serverIp} is a private address, so I can't check your DNS from here.`,
    );
    return;
  }
  const resolved = {};
  for (const name of [domain, livekitDomain]) {
    try {
      resolved[name] = await dns.resolve4(name);
    } catch {
      resolved[name] = [];
    }
  }
  const problems = dnsProblems(serverIp, resolved);
  if (problems.length === 0) {
    step("DNS points at the server");
    return;
  }
  throw new CliError(
    dnsFixMessage({ problems, serverIp, domain, livekitDomain, cloud }),
  );
}

/** The records to add when a hostname doesn't point at the server yet. */
export function dnsFixMessage({
  problems,
  serverIp,
  domain,
  livekitDomain,
  cloud,
}) {
  const lines = [
    "Your hostnames don't point at this server yet, and certificates can't be issued until they do:",
    "",
    ...problems.map(
      (p) =>
        `  ${p.name}  ${p.found.length ? `points at ${p.found.join(", ")}` : "doesn't resolve"}`,
    ),
    "",
    "Add these DNS records, wait a minute or two, and run this again:",
    "",
    `  A  ${domain}  ${serverIp}`,
    `  A  ${livekitDomain}  ${serverIp}`,
  ];
  if (cloud.id === "aws") {
    lines.push(
      "",
      "On AWS, use an Elastic IP: a plain public IP changes whenever the instance is stopped and started.",
    );
  }
  lines.push("", "Behind a proxy or CDN on purpose? Pass --skip-dns-check.");
  return lines.join("\n");
}

/** Run a command on the server that must succeed. */
async function must(ssh, command, what) {
  const res = await ssh.exec(command);
  if (res.code !== 0) {
    throw new CliError(`Couldn't ${what} on the server.\n${res.stderr.trim()}`);
  }
}

/** Write `content` to a file on the server over stdin (so secrets never appear in a process list). */
async function writeRemote(ssh, prefix, file, content, mode) {
  const res = await ssh.exec(
    `${prefix}sh -c 'umask 077 && cat > ${file} && chmod ${mode} ${file}'`,
    { input: content },
  );
  if (res.code !== 0) {
    throw new CliError(
      `Couldn't write ${file} on the server.\n${res.stderr.trim()}`,
    );
  }
}

async function waitForHealth(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(8_000) });
      if (res.ok) return true;
    } catch {
      // Not up yet, or the certificate isn't issued yet.
    }
    await new Promise((r) => setTimeout(r, 5_000));
  }
  return false;
}

function probePort(host, port, timeoutMs = 4_000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    const done = (ok) => {
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs, () => done(false));
    socket.once("connect", () => done(true));
    socket.once("error", () => done(false));
  });
}

/** Why HTTPS isn't answering: the usual cause is a firewall, so test the ports and show Caddy's side. */
async function explainUnreachable(ssh, { serverIp, cloud, compose, url }) {
  console.log("");
  warn(`${url} didn't answer. Checking why.`);
  const closed = [];
  for (const { port, why } of FIREWALL_TCP) {
    if (!(await probePort(serverIp, port))) closed.push({ port, why });
  }
  if (closed.length > 0) {
    console.log(
      `\n  From here, ${serverIp} doesn't accept connections on: ${closed
        .map((c) => `${c.port} (${c.why})`)
        .join(", ")}`,
    );
    console.log(
      `  That's almost always the ${cloud.firewall}. Open these inbound ports for the server:\n`,
    );
    console.log(firewallSummary(cloud));
  } else {
    console.log(`\n  The ports are open, so the problem is on the server.`);
  }

  const logs = await ssh.exec(`${compose} logs --no-color --tail 20 caddy`);
  if (logs.stdout.trim()) {
    console.log(`\n  Caddy (the web server) says:\n`);
    console.log(
      logs.stdout
        .trim()
        .split("\n")
        .map((l) => `    ${dim(l)}`)
        .join("\n"),
    );
  }
}

export function firewallSummary(cloud) {
  const tcp = FIREWALL_TCP.map((p) => p.port).join(", ");
  const udp = FIREWALL_UDP.map((p) => p.port).join(", ");
  return [
    `  TCP  ${tcp}`,
    `  UDP  ${udp}`,
    cloud.id === "unknown"
      ? ""
      : `  ${dim(`(${cloud.name}: inbound rules on the ${cloud.firewall})`)}`,
  ]
    .filter(Boolean)
    .join("\n");
}
