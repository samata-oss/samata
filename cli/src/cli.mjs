import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  COMPOSE_PROJECT,
  DEFAULT_PORT,
  LIVEKIT_PORTS,
  LOCAL_EMAIL,
  LOCAL_PASSWORD,
  SPEKO_KEYS_URL,
  checkSpekoKey,
  composeUrl,
  findFreePort,
  generateEnv,
  getEnvVar,
  isPortFree,
  pickTestStack,
  looksLikeSpekoKey,
  productionComposeUrl,
  setEnvVar,
  versionAtLeast,
} from "./lib.mjs";
import { fetchCompose } from "./compose.mjs";
import { deploy } from "./deploy.mjs";
import {
  CMD,
  CliError,
  askSecret,
  askYesNo,
  bold,
  canPrompt,
  dim,
  green,
  note,
  red,
  run,
  step,
  warn,
} from "./ui.mjs";

/** `name:` in the compose file needs Compose 2.20; `--wait` needs 2.1. */
const MIN_COMPOSE = "2.20.0";
const DOCKER_INSTALL_URL = "https://docs.docker.com/get-started/get-docker/";

const HELP = `${bold("samata")}: run Samata with one command

${bold("Usage")}
  ${CMD} init [dir]
      Run it on this machine: download the stack into ./samata (or [dir]) and start it
  ${CMD} deploy --host <user@host>
      Install and start it on a server you can SSH into

${bold("Options for init")}
  --port <n>                   Dashboard port on this machine (default ${DEFAULT_PORT})
  --test                       A throwaway copy that can run next to one you already have:
                               its own containers and database, on free ports
                               (docker compose down -v removes it)
  --no-start                   Write docker-compose.yml and .env, but don't start anything
  --no-open                    Don't open the dashboard in your browser
  --speko-key <key>            Your Speko key, instead of being asked for it. One key covers
                               speech-to-text, the model and text-to-speech
  --force                      Re-download docker-compose.yml even if it already exists

${bold("Options for deploy")}
  --host <user@host>           The server. The user is optional: ubuntu, ec2-user, admin and
                               root are tried when you leave it out (also an ~/.ssh/config alias)
  -i, --identity <file>        SSH private key. On AWS this is the .pem from the key pair you
                               picked when launching the instance
  -p, --ssh-port <n>           SSH port (default 22)
  --domain <name>              Dashboard hostname, with a DNS A record pointing at the server.
                               Default: <ip>.sslip.io, which needs no DNS setup (fine for trying
                               it out; use a domain of your own for production)
  --livekit-domain <name>      LiveKit hostname (default livekit.<domain>), also an A record
  --env-file <file>            Extra KEY=VALUE settings to put in the server's .env
  --version-tag <tag>          Image tag to run, e.g. 0.1.0 (default edge: pin one in production)
  --skip-dns-check             Don't check that your domains point at the server
  --no-backup                  On a re-run, don't dump the database to /opt/samata/backups first

${bold("Options for both")}
  --ref <git ref>              Branch, tag or commit of ${bold("samata-oss/samata")} to download from (default main)
  --compose <url|path>         Use this compose file instead of the one in the repo
  -v, --version                Print the version
  -h, --help                   Show this help

${bold("init")} needs Docker with Compose v2. Re-running it in the same folder keeps your
.env and just starts the stack again.

${bold("deploy")} needs ssh on this machine and a server with a public IP: Ubuntu, Debian or
Amazon Linux, 2+ GB of memory. It installs Docker if missing. Re-running it keeps the
server's .env, so it doubles as an upgrade, and dumps the database first (the last 5
dumps are kept in /opt/samata/backups).
`;

export async function main(argv) {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 18 || (major === 18 && minor < 3)) {
    throw new CliError(
      `samata needs Node.js 18.3 or newer (you have ${process.versions.node}).`,
    );
  }

  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        port: { type: "string" },
        test: { type: "boolean", default: false },
        "no-start": { type: "boolean", default: false },
        "no-open": { type: "boolean", default: false },
        "speko-key": { type: "string" },
        force: { type: "boolean", default: false },
        ref: { type: "string" },
        compose: { type: "string" },
        host: { type: "string" },
        identity: { type: "string", short: "i" },
        "ssh-port": { type: "string", short: "p" },
        domain: { type: "string" },
        "livekit-domain": { type: "string" },
        "env-file": { type: "string" },
        "version-tag": { type: "string" },
        "skip-dns-check": { type: "boolean", default: false },
        "no-backup": { type: "boolean", default: false },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (err) {
    throw new CliError(`${err.message}\nRun \`${CMD} --help\` for usage.`);
  }
  const { values, positionals } = parsed;

  if (values.version) {
    const pkg = JSON.parse(
      await readFile(new URL("../package.json", import.meta.url), "utf8"),
    );
    console.log(pkg.version);
    return;
  }

  const [command, dir] = positionals;
  if (values.help || !command) {
    console.log(HELP);
    return;
  }
  if (command === "deploy") {
    if (positionals.length > 1) {
      throw new CliError(
        `deploy takes no arguments, got "${positionals[1]}". Pass the server with --host user@host.`,
      );
    }
    let sshPort;
    if (values["ssh-port"] !== undefined) {
      sshPort = Number(values["ssh-port"]);
      if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535) {
        throw new CliError(`--ssh-port must be a number from 1 to 65535.`);
      }
    }
    await deploy({
      host: values.host,
      identity: values.identity,
      sshPort,
      domain: values.domain,
      livekitDomain: values["livekit-domain"],
      envFile: values["env-file"],
      version: values["version-tag"],
      skipDnsCheck: values["skip-dns-check"],
      backup: !values["no-backup"],
      compose:
        values.compose ??
        productionComposeUrl({
          repo: process.env.SAMATA_REPO || undefined,
          ref: values.ref,
        }),
      repo: process.env.SAMATA_REPO || undefined,
    });
    return;
  }
  if (command !== "init") {
    throw new CliError(
      `Unknown command "${command}". Run \`${CMD} --help\` for usage.`,
    );
  }
  if (positionals.length > 2) {
    throw new CliError(`Expected one folder, got ${positionals.length - 1}.`);
  }

  let port;
  if (values.port !== undefined) {
    port = Number(values.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      throw new CliError(`--port must be a number from 1 to 65535.`);
    }
  }

  await init({
    dir: path.resolve(dir ?? "samata"),
    port,
    test: values.test,
    start: !values["no-start"],
    open: !values["no-open"],
    spekoKey: values["speko-key"]?.trim(),
    force: values.force,
    compose:
      values.compose ??
      composeUrl({
        repo: process.env.SAMATA_REPO || undefined,
        ref: values.ref,
      }),
  });
}

async function init({ dir, port, test, start, open, spekoKey, force, compose }) {
  console.log(`\n${bold("Samata")} quickstart\n`);

  if (spekoKey !== undefined) await checkGivenSpekoKey(spekoKey);
  if (start) await checkDocker();

  const composePath = path.join(dir, "docker-compose.yml");
  const envPath = path.join(dir, ".env");
  const hasEnv = existsSync(envPath);

  // A database from an earlier install is encrypted and signed with that
  // install's secrets. Fresh secrets would lock you out of it (the first
  // account owns the install and sign-up is invitation-only afterwards), so
  // refuse rather than quietly start a stack that can't read its own data.
  // (A --test stack gets a project name of its own, so it can't find one.)
  if (!hasEnv && start && !test) {
    const volume = `${COMPOSE_PROJECT}_postgres-data`;
    if ((await run("docker", ["volume", "inspect", volume])).code === 0) {
      throw new CliError(
        [
          `Found a Samata database from a previous install (docker volume "${volume}"),`,
          `but there's no .env in ${dir} to unlock it.`,
          "",
          `  • Run this from the folder you installed in before, or restore its .env, or`,
          `  • start over (this deletes that data):  docker volume rm ${volume}`,
        ].join("\n"),
      );
    }
  }

  const hasCompose = existsSync(composePath) && !force;
  // Download before creating anything, so a failure leaves no empty folder.
  let composeText;
  if (hasCompose) {
    step(`Using existing ${bold("docker-compose.yml")}`);
    note("Pass --force to download the latest.");
  } else {
    step(`Downloading ${bold("docker-compose.yml")}`);
    note(compose);
    composeText = await fetchCompose(compose);
  }

  await mkdir(dir, { recursive: true });
  if (composeText !== undefined) await writeFile(composePath, composeText);

  if (hasEnv) {
    step(`Using existing ${bold(".env")}`);
    let current = await readFile(envPath, "utf8");
    const before = current;
    if (port !== undefined) current = setEnvVar(current, "SAMATA_PORT", port);
    if (spekoKey) current = setEnvVar(current, "SPEKO_API_KEY", spekoKey);
    if (current !== before) await writeFile(envPath, current);
    if (test) note("--test only applies to a new folder: using the ports already in .env.");
  } else {
    // Ask before writing, so there's one .env write and the key is never
    // left in a file with looser permissions.
    const key = spekoKey || (await askForSpekoKey());
    const stack = test ? await pickTestStack() : undefined;
    step(`Generating secrets in ${bold(".env")}`);
    await writeFile(
      envPath,
      generateEnv({
        port: port ?? stack?.dashboard,
        spekoKey: key,
        extra: stack?.env,
      }),
      { mode: 0o600 },
    );
  }
  const envText = await readFile(envPath, "utf8");
  const hasKey = Boolean(getEnvVar(envText, "SPEKO_API_KEY"));
  const dashboardPort = Number(getEnvVar(envText, "SAMATA_PORT") ?? DEFAULT_PORT);
  const livekitPorts = [
    Number(getEnvVar(envText, "SAMATA_LIVEKIT_PORT") ?? LIVEKIT_PORTS[0]),
    Number(getEnvVar(envText, "SAMATA_LIVEKIT_TCP_PORT") ?? LIVEKIT_PORTS[1]),
  ];
  const testProject = getEnvVar(envText, "COMPOSE_PROJECT_NAME");
  const url = `http://localhost:${dashboardPort}`;

  if (!start) {
    console.log(
      `\nWritten to ${dir}. Start it with:\n\n  cd ${displayPath(dir)} && docker compose up -d\n`,
    );
    return;
  }

  // Our own containers hold these ports on a re-run, so only check on the
  // first start.
  const existing = await run("docker", ["compose", "ps", "-aq"], { cwd: dir });
  if (!existing.stdout.trim()) {
    await checkPorts([dashboardPort, ...livekitPorts], livekitPorts);
  }

  step("Starting Samata (the first run downloads the images)");
  const up = await run(
    "docker",
    ["compose", "up", "-d", "--wait", "--wait-timeout", "300"],
    { cwd: dir, inherit: true },
  );
  if (up.code !== 0) {
    throw new CliError(
      [
        "",
        red("Samata didn't start."),
        "",
        "  • Image pull denied or not found? The images may not be published for this",
        "    release yet. Pin an older one with SAMATA_VERSION in .env, or build your own",
        "    and set SAMATA_IMAGE_PREFIX.",
        `  • Otherwise see what failed:  cd ${displayPath(dir)} && docker compose logs`,
      ].join("\n"),
    );
  }

  const rel = displayPath(dir);
  console.log(`
${green("✔")} ${bold("Samata is running")}

  Dashboard   ${bold(url)}
  Files       ${dir}${
    testProject
      ? `
  Test stack  ${testProject}, LiveKit on ${livekitPorts.join(" and ")}: apart from any other Samata here`
      : ""
  }

${bold("Next")}
  1. Open the dashboard. You're signed in automatically as ${bold(LOCAL_EMAIL)}
     ${dim(`(password ${LOCAL_PASSWORD}, for this machine only)`)}
${
  hasKey
    ? `  2. Create an assistant and talk to it from its Test tab. It runs on your Speko
     key (speech-to-text, model and voice), already saved under Provider Keys.`
    : `  2. Provider Keys: add your Speko key (${SPEKO_KEYS_URL}). One key covers
     speech-to-text, the model and the voice. Or bring OpenAI, or Deepgram + Cartesia.
  3. Create an assistant and talk to it from its Test tab.`
}

${bold("Manage")}
  cd ${rel}
  docker compose logs -f           ${dim("# watch it work")}
  docker compose down              ${dim("# stop (your data is kept)")}
  docker compose down -v           ${dim("# stop and delete all data")}
`);

  if (open && process.stdout.isTTY && !process.env.CI) openBrowser(url);
}

/**
 * One Speko key runs the whole pipeline (transcriber, model, voice), so that's
 * the only key we ask for. Returns undefined to skip: no terminal to ask on, or
 * the person pressed Enter. Keys can always be added later in the dashboard.
 */
async function askForSpekoKey() {
  if (!canPrompt()) return undefined;

  console.log(
    `${bold("One API key")} is all Samata needs to hold a conversation. A Speko key covers
speech-to-text, the model and text-to-speech, and new accounts get $10 of free credit.
${dim(`Create one at ${SPEKO_KEYS_URL}. Press Enter to skip and add keys in the dashboard later.`)}
`,
  );

  const fromEnv = process.env.SPEKO_API_KEY?.trim();
  if (
    fromEnv &&
    looksLikeSpekoKey(fromEnv) &&
    (await askYesNo("Use the SPEKO_API_KEY from your environment?"))
  ) {
    if ((await checkSpekoKey(fromEnv)) !== "invalid") return fromEnv;
    warn("Speko rejected the key in your environment.");
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    const key = (await askSecret("Speko API key: ")).trim();
    if (!key) break;
    if (!looksLikeSpekoKey(key)) {
      warn(
        "That doesn't look like a Speko key (they start with sk_live_). Try again, or press Enter to skip.",
      );
      continue;
    }
    const status = await checkSpekoKey(key);
    if (status === "invalid") {
      warn("Speko rejected that key. Try again, or press Enter to skip.");
      continue;
    }
    if (status === "unknown") {
      note("Couldn't reach Speko to check it; using it as is.");
    }
    console.log("");
    return key;
  }
  console.log("");
  note("Skipped. Add a key on the dashboard's Provider Keys page.");
  return undefined;
}

/** A key passed with `--speko-key`: reject one that is plainly wrong. */
async function checkGivenSpekoKey(key) {
  if (!looksLikeSpekoKey(key)) {
    throw new CliError(
      `--speko-key doesn't look like a Speko key (they start with sk_live_). Create one at ${SPEKO_KEYS_URL}`,
    );
  }
  if ((await checkSpekoKey(key)) === "invalid") {
    throw new CliError("Speko rejected the key given to --speko-key.");
  }
}

/** `dir` as you'd type it: relative when it's under here, else absolute. */
function displayPath(dir) {
  const rel = path.relative(process.cwd(), dir);
  if (rel === "") return ".";
  return rel.startsWith("..") || path.isAbsolute(rel) ? dir : rel;
}

async function checkDocker() {
  const docker = await run("docker", ["--version"]);
  if (docker.error?.code === "ENOENT" || docker.code !== 0) {
    throw new CliError(
      `Docker isn't installed. Get it from ${DOCKER_INSTALL_URL} and run this again.`,
    );
  }

  const compose = await run("docker", ["compose", "version", "--short"]);
  if (compose.code !== 0) {
    throw new CliError(
      `Docker Compose v2 isn't available. Update Docker: ${DOCKER_INSTALL_URL}`,
    );
  }
  if (!versionAtLeast(compose.stdout, MIN_COMPOSE)) {
    throw new CliError(
      `Docker Compose ${MIN_COMPOSE} or newer is required (you have ${compose.stdout.trim()}). Update Docker: ${DOCKER_INSTALL_URL}`,
    );
  }

  if ((await run("docker", ["info"])).code !== 0) {
    throw new CliError(
      "Docker is installed but not running. Start Docker Desktop (or the docker daemon) and run this again.",
    );
  }
}

async function checkPorts(ports, livekitPorts) {
  const busy = [];
  for (const port of ports) {
    if (!(await isPortFree(port))) busy.push(port);
  }
  if (busy.length === 0) return;

  const lines = [`Port ${busy.join(", ")} is already in use on this machine.`];
  if (busy.includes(ports[0])) {
    const free = await findFreePort(ports[0] + 1);
    lines.push(
      `Pick another dashboard port with:  ${CMD} init --port ${free ?? DEFAULT_PORT + 100}`,
    );
  }
  if (busy.some((p) => livekitPorts.includes(p))) {
    lines.push(
      `${livekitPorts.join(" and ")} are LiveKit's: stop whatever is using them (another LiveKit server?) and run this again.`,
      `Or run a separate copy that doesn't share them:  ${CMD} init --test`,
    );
  }
  throw new CliError(lines.join("\n"));
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === "darwin"
      ? ["open", [url]]
      : process.platform === "win32"
        ? ["cmd", ["/c", "start", "", url]]
        : ["xdg-open", [url]];
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true })
      .on("error", () => {})
      .unref();
  } catch {
    // Opening the browser is a nicety; the URL is already printed.
  }
}
