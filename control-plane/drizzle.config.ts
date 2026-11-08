import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  // The cloud tables share the one migration history, so the OSS and cloud
  // builds run the same migrations and never drift.
  schema: ["./src/db/schema.ts", "./src/cloud/schema.ts"],
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
