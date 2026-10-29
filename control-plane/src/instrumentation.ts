/**
 * Runs once when the server boots. In production, apply pending migrations
 * first so self-hosters run a single image with no separate migrate step.
 * Set SAMATA_AUTO_MIGRATE=0 to manage migrations yourself.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NODE_ENV !== "production") return;
  if (process.env.SAMATA_AUTO_MIGRATE === "0") return;

  const { runMigrations } = await import("./server/migrate");
  await runMigrations();
}
