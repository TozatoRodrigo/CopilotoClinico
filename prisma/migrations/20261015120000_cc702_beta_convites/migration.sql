-- CC-702 — Convite e onboarding do beta.
--
-- beta_invites: códigos de convite gerados no console admin, por lote/origem
-- ("rede Ripardo", "base ANY"), de uso único ou com limite de usos, com
-- validade e revogação. O código é aleatório (sem dado pessoal). O CHECK
-- uses_count <= max_uses é a última barreira contra uso além do limite: o
-- serviço já consome o uso com UPDATE condicional na transação do cadastro.
--
-- beta_participants: o médico que entrou por convite (uma linha por médico,
-- gravada na transação do cadastro), com o aceite do termo do beta (versão e
-- data) e o perfil mínimo da CC-701. A eliminação LGPD apaga termo e perfil
-- (UPDATE) e mantém só os ids, para a contagem do lote.
--
-- beta_waitlist_entries: quem chegou sem convite com BETA_INVITE_REQUIRED
-- ligada. E-mail, perfil opcional e o consentimento explícito para contato.
-- Apagável a pedido pelo console admin (DELETE) e pela eliminação LGPD da
-- conta com o mesmo e-mail.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions), só o DML que a API usa.
-- Convite nunca é apagado (revogar é UPDATE) e a linha do participante só
-- sai com o médico (CASCADE); por isso sem DELETE nessas duas.
--
-- Reversível via:
--   DROP TABLE "beta_participants";
--   DROP TABLE "beta_invites";
--   DROP TABLE "beta_waitlist_entries";
--   DROP TYPE "BetaWaitlistStatus";

CREATE TYPE "BetaWaitlistStatus" AS ENUM ('waiting', 'invited', 'registered');

CREATE TABLE "beta_invites" (
    "id" UUID NOT NULL,
    "code" VARCHAR(16) NOT NULL,
    "batch_label" VARCHAR(60) NOT NULL,
    "max_uses" INTEGER NOT NULL DEFAULT 1,
    "uses_count" INTEGER NOT NULL DEFAULT 0,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_by_id" UUID NOT NULL,
    "waitlist_entry_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "beta_invites_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "beta_invites_max_uses_check" CHECK ("max_uses" >= 1),
    CONSTRAINT "beta_invites_uses_count_check" CHECK ("uses_count" >= 0 AND "uses_count" <= "max_uses")
);

CREATE TABLE "beta_participants" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "invite_id" UUID NOT NULL,
    "joined_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "terms_version" VARCHAR(40),
    "terms_accepted_at" TIMESTAMP(3),
    "training" VARCHAR(32),
    "facility_type" VARCHAR(32),
    "uf" CHAR(2),
    "city_type" VARCHAR(32),
    "profile_updated_at" TIMESTAMP(3),

    CONSTRAINT "beta_participants_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "beta_waitlist_entries" (
    "id" UUID NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "training" VARCHAR(32),
    "facility_type" VARCHAR(32),
    "uf" CHAR(2),
    "city_type" VARCHAR(32),
    "contact_consent_at" TIMESTAMP(3) NOT NULL,
    "status" "BetaWaitlistStatus" NOT NULL DEFAULT 'waiting',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "beta_waitlist_entries_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "beta_invites_code_key" ON "beta_invites"("code");

CREATE INDEX "beta_invites_batch_label_idx" ON "beta_invites"("batch_label");

CREATE INDEX "beta_invites_waitlist_entry_id_idx" ON "beta_invites"("waitlist_entry_id");

CREATE INDEX "beta_invites_created_at_idx" ON "beta_invites"("created_at");

CREATE UNIQUE INDEX "beta_participants_physician_id_key" ON "beta_participants"("physician_id");

CREATE INDEX "beta_participants_invite_id_idx" ON "beta_participants"("invite_id");

CREATE UNIQUE INDEX "beta_waitlist_entries_email_key" ON "beta_waitlist_entries"("email");

CREATE INDEX "beta_waitlist_entries_status_created_at_idx" ON "beta_waitlist_entries"("status", "created_at");

ALTER TABLE "beta_invites" ADD CONSTRAINT "beta_invites_waitlist_entry_id_fkey" FOREIGN KEY ("waitlist_entry_id") REFERENCES "beta_waitlist_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "beta_participants" ADD CONSTRAINT "beta_participants_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "beta_participants" ADD CONSTRAINT "beta_participants_invite_id_fkey" FOREIGN KEY ("invite_id") REFERENCES "beta_invites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DML mínimo para a API. Sem TRUNCATE, sem REFERENCES, sem TRIGGER. O REVOKE
-- tira o DELETE que os DEFAULT PRIVILEGES da AUD-002 concedem quando a
-- migration roda com a role que os declarou.
GRANT SELECT, INSERT, UPDATE ON TABLE "beta_invites" TO copiloto_app;
REVOKE DELETE, TRUNCATE ON TABLE "beta_invites" FROM copiloto_app;
GRANT SELECT, INSERT, UPDATE ON TABLE "beta_participants" TO copiloto_app;
REVOKE DELETE, TRUNCATE ON TABLE "beta_participants" FROM copiloto_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "beta_waitlist_entries" TO copiloto_app;
REVOKE TRUNCATE ON TABLE "beta_waitlist_entries" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'beta_invites', privilege) THEN
      RAISE EXCEPTION 'Migration CC-702: copiloto_app sem % em beta_invites', privilege;
    END IF;
    IF NOT has_table_privilege('copiloto_app', 'beta_participants', privilege) THEN
      RAISE EXCEPTION 'Migration CC-702: copiloto_app sem % em beta_participants', privilege;
    END IF;
  END LOOP;

  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'beta_waitlist_entries', privilege) THEN
      RAISE EXCEPTION 'Migration CC-702: copiloto_app sem % em beta_waitlist_entries', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'beta_invites', 'DELETE')
    OR has_table_privilege('copiloto_app', 'beta_participants', 'DELETE') THEN
    RAISE EXCEPTION 'Migration CC-702: copiloto_app não deveria apagar convites nem participantes';
  END IF;

  IF has_table_privilege('copiloto_app', 'beta_invites', 'TRUNCATE')
    OR has_table_privilege('copiloto_app', 'beta_participants', 'TRUNCATE')
    OR has_table_privilege('copiloto_app', 'beta_waitlist_entries', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-702: copiloto_app não deveria ter TRUNCATE nas tabelas do beta';
  END IF;
END;
$$;
