import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import {
  COMPOSE_PROJECT,
  DEFAULT_PORT,
  LIVEKIT_PORTS,
  composeUrl,
  findFreePort,
  generateEnv,
  getEnvVar,
  isPortFree,
  looksLikeCompose,
  setEnvVar,
  versionAtLeast,
} from "./lib.mjs";

/** `name:` in the compose file needs Compose 2.20; `--wait` needs 2.1. */
const MIN_COMPOSE = "2.20.0";
const DOCKER_INSTALL_URL = "https://docs.docker.com/get-started/get-docker/";

/** An expected failure: print the message, exit 1, no stack trace. */
class CliError extends Error {}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
const bold = paint("1");
const dim = paint("2");
const green = paint("32");
const cyan = paint("36");
const red = paint("31");

const step = (text) => console.log(`${cyan("→")} ${text}`);
const note = (text) => console.log(`  ${dim(text)}`);

const HELP = `${bold("samata")}: run Samata on your machine with one command

${bold("Usage")}
  npx samata init [dir]        Download the stack into ./samata (or [dir]) and start it

${bold("Options")}
  --port <n>                   Dashboard port on this machine (default ${DEFAULT_PORT})
  --no-start                   Write docker-compose.yml and .env, but don't start anything
  --no-open                    Don't open the dashboard in your browser
  --force                      Re-download docker-compose.yml even if it already exists
  --ref <git ref>              Branch, tag or commit of ${bold("samata-oss/samata")} to download from (default main)
  --compose <url|path>         Use this compose file instead of the one in the repo
  -v, --version                Print the version
  -h, --help                   Show this help

Needs Docker with Compose v2. Re-running \`init\` in the same folder keeps your
.env and just starts the stack again.
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
        "no-start": { type: "boolean", default: false },
        "no-open": { type: "boolean", default: false },
        force: { type: "boolean", default: false },
        ref: { type: "string" },
        compose: { type: "string" },
        version: { type: "boolean", short: "v", default: false },
        help: { type: "boolean", short: "h", default: false },
      },
    });
  } catch (err) {
    throw new CliError(`${err.message}\nRun \`samata --help\` for usage.`);
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
  if (command !== "init") {
    throw new CliError(
      `Unknown command "${command}". Run \`samata --help\` for usage.`,
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
    start: !values["no-start"],
    open: !values["no-open"],
    force: values.force,
    compose:
      values.compose ??
      composeUrl({
        repo: process.env.SAMATA_REPO || undefined,
        ref: values.ref,
      }),
  });
}

async function init({ dir, port, start, open, force, compose }) {
  console.log(`\n${bold("Samata")} quickstart\n`);

  if (start) await checkDocker();

  const composePath = path.join(dir, "docker-compose.yml");
  const envPath = path.join(dir, ".env");
  const hasEnv = existsSync(envPath);

  // A database from an earlier install is encrypted and signed with that
  // install's secrets. Fresh secrets would lock you out of it (the first
  // account owns the install and sign-up is invitation-only afterwards), so
  // refuse rather than quietly start a stack that can't read its own data.
  if (!hasEnv && start) {
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
    if (port !== undefined) {
      const current = await readFile(envPath, "utf8");
      await writeFile(envPath, setEnvVar(current, "SAMATA_PORT", port));
    }
  } else {
    step(`Generating secrets in ${bold(".env")}`);
    await writeFile(envPath, generateEnv({ port }), { mode: 0o600 });
  }
  const dashboardPort = Number(
    getEnvVar(await readFile(envPath, "utf8"), "SAMATA_PORT") ?? DEFAULT_PORT,
  );
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
    await checkPorts([dashboardPort, ...LIVEKIT_PORTS]);
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
  Files       ${dir}

${bold("Next")}
  1. Open the dashboard and sign up. ${bold("The first account becomes the owner.")}
  2. Provider Keys: add your OpenAI (or Deepgram + Cartesia) key.
  3. Create an assistant and talk to it from its Test tab.

${bold("Manage")}
  cd ${rel}
  docker compose logs -f           ${dim("# watch it work")}
  docker compose down              ${dim("# stop (your data is kept)")}
  docker compose down -v           ${dim("# stop and delete all data")}
`);

  if (open && process.stdout.isTTY && !process.env.CI) openBrowser(url);
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

async function checkPorts(ports) {
  const busy = [];
  for (const port of ports) {
    if (!(await isPortFree(port))) busy.push(port);
  }
  if (busy.length === 0) return;

  const lines = [`Port ${busy.join(", ")} is already in use on this machine.`];
  if (busy.includes(ports[0])) {
    const free = await findFreePort(ports[0] + 1);
    lines.push(
      `Pick another dashboard port with:  npx samata init --port ${free ?? 3100}`,
    );
  }
  if (busy.some((p) => LIVEKIT_PORTS.includes(p))) {
    lines.push(
      `${LIVEKIT_PORTS.join(" and ")} are LiveKit's: stop whatever is using them (another LiveKit server?) and run this again.`,
    );
  }
  throw new CliError(lines.join("\n"));
}

async function fetchCompose(source) {
  let text;
  if (/^https?:\/\//.test(source)) {
    let res;
    try {
      res = await fetch(source, { signal: AbortSignal.timeout(20_000) });
    } catch (err) {
      throw new CliError(
        `Couldn't download ${source}: ${err.cause?.message ?? err.message}\nCheck your connection and try again.`,
      );
    }
    if (!res.ok) {
      throw new CliError(
        `Couldn't download ${source} (HTTP ${res.status}).${
          res.status === 404
            ? " Check --ref, or pass --compose with your own file."
            : ""
        }`,
      );
    }
    text = await res.text();
  } else {
    try {
      text = await readFile(source, "utf8");
    } catch {
      throw new CliError(`Couldn't read the compose file at ${source}.`);
    }
  }
  if (!looksLikeCompose(text)) {
    throw new CliError(`${source} doesn't look like a docker compose file.`);
  }
  return text;
}

/**
 * Run a command. By default output is captured; with `inherit` it streams to
 * the terminal (for the image pull progress). Never rejects: failure to spawn
 * comes back as `error`.
 */
function run(cmd, args, { cwd, inherit = false } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: inherit ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) =>
      resolve({ code: null, stdout, stderr, error }),
    );
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
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
