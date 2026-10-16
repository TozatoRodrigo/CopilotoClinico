-- CC-905 — Termos de uso e política de privacidade versionados, com o aceite
-- de cada médico.
--
-- legal_documents guarda cada versão publicada (tipo, versão, título, seções,
-- resumo do que mudou, hash do texto, `provisional` e quem publicou). O texto
-- vem do catálogo versionado no código e é copiado aqui na publicação: o
-- aceite aponta para o texto exato que o médico leu. Versão publicada não
-- muda — texto novo é versão nova —, então a API só lê e insere (mesmo
-- tratamento de ai_calls).
--
-- legal_acceptances guarda só o vínculo (médico, versão) e a data: sem IP,
-- sem navegador. A API insere, lê e apaga (eliminação LGPD); não atualiza.
-- ON DELETE RESTRICT para o documento: uma versão aceita não some.
--
-- Nada muda para o médico enquanto LEGAL_TERMS_V2 estiver desligada e
-- enquanto nenhuma versão for publicada (console admin → Termos).
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions) e REVOKE do que os DEFAULT
-- PRIVILEGES de 20260605030000_aud_002_db_least_privilege concedem.
--
-- Reversível via:
--   DROP TABLE "legal_acceptances";
--   DROP TABLE "legal_documents";

CREATE TABLE "legal_documents" (
    "id" UUID NOT NULL,
    "type" VARCHAR(40) NOT NULL,
    "version" VARCHAR(64) NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "sections" JSONB NOT NULL,
    "change_summary" TEXT[],
    "content_hash" CHAR(64) NOT NULL,
    "provisional" BOOLEAN NOT NULL,
    "published_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by_id" UUID NOT NULL,

    CONSTRAINT "legal_documents_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "legal_acceptances" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "legal_acceptances_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "legal_documents_type_published_at_idx" ON "legal_documents"("type", "published_at");

CREATE UNIQUE INDEX "legal_documents_type_version_key" ON "legal_documents"("type", "version");

CREATE INDEX "legal_acceptances_document_id_idx" ON "legal_acceptances"("document_id");

CREATE UNIQUE INDEX "legal_acceptances_physician_id_document_id_key" ON "legal_acceptances"("physician_id", "document_id");

ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "legal_acceptances" ADD CONSTRAINT "legal_acceptances_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "legal_documents"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

GRANT SELECT, INSERT ON TABLE "legal_documents" TO copiloto_app;
REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "legal_documents" FROM copiloto_app;

GRANT SELECT, INSERT, DELETE ON TABLE "legal_acceptances" TO copiloto_app;
REVOKE UPDATE, TRUNCATE ON TABLE "legal_acceptances" FROM copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'legal_documents', privilege) THEN
      RAISE EXCEPTION 'Migration CC-905: copiloto_app sem % em legal_documents', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'legal_documents', 'UPDATE')
    OR has_table_privilege('copiloto_app', 'legal_documents', 'DELETE')
    OR has_table_privilege('copiloto_app', 'legal_documents', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-905: copiloto_app só deveria inserir e ler legal_documents';
  END IF;

  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'legal_acceptances', privilege) THEN
      RAISE EXCEPTION 'Migration CC-905: copiloto_app sem % em legal_acceptances', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'legal_acceptances', 'UPDATE')
    OR has_table_privilege('copiloto_app', 'legal_acceptances', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-905: copiloto_app não deveria atualizar nem truncar legal_acceptances';
  END IF;
END;
$$;
