import "dotenv/config";
import { Client } from "pg";
import { runMigrations } from "../src/server/migrate";

// Hosts we're willing to wipe without `--force`.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "postgres"]);

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");

  const { hostname, pathname } = new URL(url);
  if (!LOCAL_HOSTS.has(hostname) && !process.argv.includes("--force")) {
    throw new Error(
      `Refusing to reset the database on "${hostname}". Pass --force if you really mean it.`,
    );
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    // Drop everything the app owns: tables in `public` plus drizzle's own
    // migration journal, so migrations replay from scratch.
    await client.query("drop schema if exists drizzle cascade");
    await client.query("drop schema if exists public cascade");
    await client.query("create schema public");
  } finally {
    await client.end();
  }
  console.log(`[reset] dropped all data in "${pathname.slice(1)}"`);

  await runMigrations();
  console.log("[reset] done. Run `pnpm db:seed` to load the example agent.");
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
