-- F4 — Referência anexada pelo médico a um atendimento específico.
--
-- Guarda o texto já extraído e mascarado de PII, nunca o arquivo original
-- (minimização LGPD). ON DELETE CASCADE acompanha o apagamento do encontro,
-- para o direito de eliminação (LGPD Art. 18) não deixar órfãos.
CREATE TABLE "encounter_attachments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "encounter_id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "filename" VARCHAR(300) NOT NULL,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_attachments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "encounter_attachments_encounter_id_idx" ON "encounter_attachments"("encounter_id");

ALTER TABLE "encounter_attachments"
    ADD CONSTRAINT "encounter_attachments_encounter_id_fkey"
    FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;
