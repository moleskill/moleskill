import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: ".env" });

// `prisma generate` (run from postinstall/build) must not fail when no database is configured,
// so we do not use env(), which throws on missing variables.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "" },
});
