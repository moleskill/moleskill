CREATE TABLE "meeting_shares" (
  "id" UUID NOT NULL,
  "meeting_id" UUID NOT NULL,
  "token_hash" TEXT NOT NULL,
  "created_by" UUID NOT NULL,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  "revoked_at" TIMESTAMPTZ(6),
  "show_transcript" BOOLEAN NOT NULL DEFAULT true,
  "show_audio" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "meeting_shares_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "meeting_shares_meeting_id_fkey" FOREIGN KEY ("meeting_id") REFERENCES "meetings"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "meeting_shares_token_hash_key" ON "meeting_shares"("token_hash");
CREATE INDEX "meeting_shares_meeting_id_created_at_idx" ON "meeting_shares"("meeting_id", "created_at" DESC);
