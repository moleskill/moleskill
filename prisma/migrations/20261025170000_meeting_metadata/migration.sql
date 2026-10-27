ALTER TABLE "meetings"
  ADD COLUMN "recorded_at" TIMESTAMPTZ(6),
  ADD COLUMN "duration_sec" INTEGER,
  ADD COLUMN "language" TEXT,
  ADD COLUMN "speaker_names" JSONB,
  ADD COLUMN "processing_stage" TEXT;
