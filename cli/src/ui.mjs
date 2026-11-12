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
