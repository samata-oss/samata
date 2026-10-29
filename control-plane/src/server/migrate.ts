import path from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Client } from "pg";

// Arbitrary, but fixed: every replica must contend for the same lock.
const MIGRATION_LOCK_ID = 727_826_820;

/**
 * Apply drizzle/ migrations. An advisory lock makes this safe when several
 * replicas boot at once: one migrates, the rest wait and then find nothing
 * left to do.
 */
export async function runMigrations() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query("select pg_advisory_lock($1)", [MIGRATION_LOCK_ID]);
    await migrate(drizzle(client), {
      migrationsFolder: path.join(process.cwd(), "drizzle"),
    });
    console.log("[migrate] database is up to date");
  } finally {
    await client
      .query("select pg_advisory_unlock($1)", [MIGRATION_LOCK_ID])
      .catch(() => {});
    await client.end();
  }
}
