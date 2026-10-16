-- CC-334 — Entrar com Google ou Microsoft (quem vem do ANY App).
--
-- external_identities liga uma conta Google ou Microsoft a um médico. A chave
-- é (provider, subject): o `sub` do id_token é estável, o e-mail não.
-- email_at_link guarda o e-mail que o provedor garantiu no momento do vínculo,
-- só para suporte. ON DELETE CASCADE a partir do médico; a eliminação LGPD
-- (que anonimiza o médico em vez de apagar) apaga estas linhas explicitamente,
-- para que a conta externa não continue entrando na conta anonimizada.
--
-- physicians.password_hash passa a aceitar NULL: a conta criada pelo login
-- social não tem senha. Só relaxa a restrição; nenhuma linha muda.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions). A API vincula (INSERT), lê
-- (SELECT), marca o último login (UPDATE) e apaga na eliminação (DELETE).
--
-- Reversível via (só enquanto não existir conta sem senha):
--   DROP TABLE "external_identities";
--   DROP TYPE "ExternalIdentityProvider";
--   ALTER TABLE "physicians" ALTER COLUMN "password_hash" SET NOT NULL;

CREATE TYPE "ExternalIdentityProvider" AS ENUM ('google', 'microsoft');

ALTER TABLE "physicians" ALTER COLUMN "password_hash" DROP NOT NULL;

CREATE TABLE "external_identities" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "provider" "ExternalIdentityProvider" NOT NULL,
    "subject" VARCHAR(255) NOT NULL,
    "email_at_link" VARCHAR(255) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMP(3),

    CONSTRAINT "external_identities_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "external_identities_physician_id_idx" ON "external_identities"("physician_id");

CREATE UNIQUE INDEX "external_identities_provider_subject_key" ON "external_identities"("provider", "subject");

ALTER TABLE "external_identities" ADD CONSTRAINT "external_identities_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- DML mínimo para a API. Sem TRUNCATE, sem REFERENCES, sem TRIGGER.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "external_identities" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'external_identities', privilege) THEN
      RAISE EXCEPTION 'Migration CC-334: copiloto_app sem % em external_identities', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'external_identities', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-334: copiloto_app não deveria ter TRUNCATE em external_identities';
  END IF;
END;
$$;
