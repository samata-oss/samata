import { spawn } from "node:child_process";

/** An expected failure: print the message, exit 1, no stack trace. */
export class CliError extends Error {}

const useColor = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (text) =>
  useColor ? `\u001b[${code}m${text}\u001b[0m` : text;
export const bold = paint("1");
export const dim = paint("2");
export const green = paint("32");
export const yellow = paint("33");
export const cyan = paint("36");
export const red = paint("31");

export const step = (text) => console.log(`${cyan("→")} ${text}`);
export const note = (text) => console.log(`  ${dim(text)}`);
export const warn = (text) => console.log(`${yellow("!")} ${text}`);

/** How people invoke this package, for the commands we tell them to run. */
export const CMD = "npx @samata-oss/cli";

/**
 * Run a command. By default output is captured; with `inherit` it streams to
 * the terminal (for the image pull progress). `input` is written to stdin.
 * Never rejects: failure to spawn comes back as `error`.
 */
export function run(cmd, args, { cwd, inherit = false, input } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio: inherit
        ? [input === undefined ? "inherit" : "pipe", "inherit", "inherit"]
        : [input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
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
    if (input !== undefined) {
      // An early exit closes the pipe; that's reported through `code`.
      child.stdin.on("error", () => {});
      child.stdin.end(input);
    }
  });
}

/** Whether we can ask the person questions: a terminal on both ends, not CI. */
export const canPrompt = () =>
  Boolean(process.stdin.isTTY && process.stdout.isTTY && !process.env.CI);

/**
 * Read one line without echoing it, showing `*` per character so a paste is
 * visibly received. Enter submits an empty answer too; Ctrl-C quits.
 */
export function askSecret(question) {
  return new Promise((resolve) => {
    const { stdin, stdout } = process;
    let answer = "";
    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    const finish = () => {
      stdin.off("data", onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write("\n");
      resolve(answer);
    };
    const onData = (chunk) => {
      // Arrow keys and friends arrive as an escape sequence: ignore them.
      if (chunk.startsWith("\u001b") && chunk.length < 8) return;
      for (const ch of chunk) {
        if (ch === "\r" || ch === "\n") return finish();
        if (ch === "\u0003") {
          stdin.setRawMode(false);
          stdout.write("\n");
          process.exit(130);
        }
        if (ch === "\u007f" || ch === "\b") {
          if (answer) {
            answer = answer.slice(0, -1);
            stdout.write("\b \b");
          }
        } else if (ch >= " ") {
          answer += ch;
          stdout.write("*");
        }
      }
    };
    stdin.on("data", onData);
  });
}

/** A yes/no question where Enter means yes. */
export async function askYesNo(question) {
  const { createInterface } = await import("node:readline/promises");
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  rl.on("SIGINT", () => process.exit(130));
  try {
    const answer = (await rl.question(`${question} ${dim("[Y/n]")} `)).trim();
    return !/^n/i.test(answer);
  } finally {
    rl.close();
  }
}
