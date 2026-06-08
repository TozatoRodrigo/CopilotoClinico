-- IAM-002: CRM Verification Flow
-- Adds crm_verification_requests table and CrmVerificationStatus enum

CREATE TYPE "CrmVerificationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

CREATE TABLE "crm_verification_requests" (
    "id"           UUID        NOT NULL DEFAULT gen_random_uuid(),
    "physician_id" UUID        NOT NULL,
    "status"       "CrmVerificationStatus" NOT NULL DEFAULT 'PENDING',
    "notes"        TEXT,
    "resolved_by"  VARCHAR(255),
    "resolved_at"  TIMESTAMP(3),
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "crm_verification_requests_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "crm_verification_requests_physician_id_fkey"
        FOREIGN KEY ("physician_id")
        REFERENCES "physicians"("id")
        ON DELETE CASCADE
);

CREATE INDEX "crm_verification_requests_physician_id_idx"
    ON "crm_verification_requests"("physician_id");

CREATE INDEX "crm_verification_requests_status_idx"
    ON "crm_verification_requests"("status");
