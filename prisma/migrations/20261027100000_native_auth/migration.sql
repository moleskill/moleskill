-- Replace Clerk with the app's own authentication.

-- CreateEnum
CREATE TYPE "AuthCodePurpose" AS ENUM ('VERIFY_EMAIL', 'RESET_PASSWORD');

-- Clerk is gone: drop its webhook bookkeeping and the Clerk id column.
DROP TABLE IF EXISTS "clerk_webhook_state";
DROP INDEX IF EXISTS "users_clerk_id_key";
ALTER TABLE "users" DROP COLUMN "clerk_id",
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "google_id" TEXT,
  ADD COLUMN "email_verified_at" TIMESTAMPTZ(6);

-- Clerk only let verified addresses in, so anyone who already exists counts as verified.
-- They have no password yet: they use "Forgot password" or Google once.
UPDATE "users" SET "email_verified_at" = "created_at";

-- CreateIndex
CREATE UNIQUE INDEX "users_google_id_key" ON "users"("google_id");

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "user_agent" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auth_codes" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "purpose" "AuthCodePurpose" NOT NULL,
    "code_hash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "consumed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auth_codes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_hash_key" ON "sessions"("token_hash");
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");
CREATE INDEX "sessions_expires_at_idx" ON "sessions"("expires_at");
CREATE INDEX "auth_codes_email_purpose_created_at_idx" ON "auth_codes"("email", "purpose", "created_at" DESC);
CREATE INDEX "auth_codes_expires_at_idx" ON "auth_codes"("expires_at");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- New tables hold password hashes and session hashes: re-run supabase/setup.sql after migrating so RLS is enabled on them.
