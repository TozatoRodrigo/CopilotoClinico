-- LGPD — Retenção das capturas de áudio (RT-003).
--
-- `retain_until` (upload + 30 dias) era gravado, mas nada o lia: o áudio
-- cifrado ficava no banco para sempre. O AudioRetentionCronService passa a
-- eliminar o conteúdo vencido e marcar a linha como `deleted`. A linha fica
-- como lápide (metadados + transcrição já mascarada), ligada à trilha de
-- auditoria pelo mesmo id — ver "Capturas de áudio" em docs/compliance/LGPD.md.
--
-- `encrypted_content` vira opcional e a CHECK amarra os dois sentidos:
--   - linha `deleted` nunca guarda áudio;
--   - linha viva (pending/transcribing/completed/failed) sempre tem áudio.
-- Nenhuma linha existente viola a CHECK: até aqui nada gravava `deleted`.
--
-- Permissões: só altera coluna e constraint; os GRANTs de copiloto_app em
-- audio_captures continuam valendo.
--
-- Reversível via:
--   ALTER TABLE "audio_captures" DROP CONSTRAINT "audio_captures_content_matches_status";
--   -- e, só depois de apagar as linhas `deleted`:
--   ALTER TABLE "audio_captures" ALTER COLUMN "encrypted_content" SET NOT NULL;

ALTER TABLE "audio_captures" ALTER COLUMN "encrypted_content" DROP NOT NULL;

ALTER TABLE "audio_captures"
    ADD CONSTRAINT "audio_captures_content_matches_status"
    CHECK (("status" = 'deleted') = ("encrypted_content" IS NULL));
