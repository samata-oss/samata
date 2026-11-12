import { readFile } from "node:fs/promises";
import { looksLikeCompose } from "./lib.mjs";
import { CliError } from "./ui.mjs";

/** A compose file from a URL or a local path. Throws if it isn't one. */
export async function fetchCompose(source) {
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
