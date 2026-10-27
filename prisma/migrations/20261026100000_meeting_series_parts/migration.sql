ALTER TABLE "meetings"
  ADD COLUMN "series_id" UUID,
  ADD COLUMN "part_no" INTEGER,
  ADD COLUMN "part_count" INTEGER;

CREATE INDEX "meetings_workspace_id_series_id_part_no_idx"
  ON "meetings"("workspace_id", "series_id", "part_no");
