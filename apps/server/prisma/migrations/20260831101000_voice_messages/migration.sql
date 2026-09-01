ALTER TABLE "Attachment"
  ADD COLUMN "durationMs" INTEGER,
  ADD COLUMN "waveform" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[],
  ADD CONSTRAINT "Attachment_audio_has_metadata"
    CHECK (
      ("kind" <> 'AUDIO') OR
      ("durationMs" IS NOT NULL AND cardinality("waveform") = 64)
    );
