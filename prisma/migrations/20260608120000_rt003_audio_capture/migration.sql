-- RT-003: AudioCapture table for LGPD-compliant encrypted voice recordings
-- Audio content stored AES-256-GCM encrypted; retainUntil enforces 30-day default retention.

CREATE TYPE "AudioCaptureStatus" AS ENUM ('pending', 'transcribing', 'completed', 'failed', 'deleted');

CREATE TABLE "audio_captures" (
    "id"                UUID        NOT NULL DEFAULT gen_random_uuid(),
    "encounter_id"      UUID        NOT NULL,
    "physician_id"      UUID        NOT NULL,
    "encrypted_content" TEXT        NOT NULL,
    "mime_type"         VARCHAR(100) NOT NULL,
    "size_bytes"        INTEGER     NOT NULL,
    "status"            "AudioCaptureStatus" NOT NULL DEFAULT 'pending',
    "job_id"            VARCHAR(255),
    "transcribed_text"  TEXT,
    "retain_until"      TIMESTAMP(3) NOT NULL,
    "created_at"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at"        TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audio_captures_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "audio_captures"
    ADD CONSTRAINT "audio_captures_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "audio_captures_encounter_id_idx" ON "audio_captures"("encounter_id");
CREATE INDEX "audio_captures_physician_id_idx" ON "audio_captures"("physician_id");
CREATE INDEX "audio_captures_retain_until_idx" ON "audio_captures"("retain_until");
