-- CC-602 — Locais de plantão do médico (perfil do local aplicado ao caso).
--
-- Cada linha descreve um serviço onde o médico dá plantão: recursos (TC,
-- laboratório, UTI, SUS), porte, especialistas e distância/tempo até a
-- referência. O local padrão preenche o contexto do caso novo; o caso guarda
-- uma cópia em encounters.context.site (sem migration: a coluna já é JSON).
-- Nenhum dado de paciente.
--
-- facility_type e specialists são validados na aplicação contra as listas de
-- src/shared/contracts/practice-site.ts (mesmo tratamento de physicians.locale):
-- um porte novo não exige migration.
--
-- Um padrão por médico: índice único parcial. O Prisma não descreve índice
-- parcial no schema, por isso ele vive só aqui (como o índice ivfflat parcial
-- de 20260606111800_perf_001_guideline_embedding_ivfflat).
--
-- ON DELETE CASCADE: apagar o médico apaga os locais dele.
--
-- Permissões: GRANT explícito para copiloto_app (ver
-- 20261010120000_f0d_recommendation_decisions). O médico cria, edita e apaga
-- os próprios locais: DML completo, sem TRUNCATE.
--
-- Reversível via:
--   DROP TABLE "practice_sites";

CREATE TABLE "practice_sites" (
    "id" UUID NOT NULL,
    "physician_id" UUID NOT NULL,
    "name" VARCHAR(80) NOT NULL,
    "facility_type" VARCHAR(32) NOT NULL,
    "has_ct" BOOLEAN NOT NULL DEFAULT false,
    "has_lab" BOOLEAN NOT NULL DEFAULT false,
    "has_icu" BOOLEAN NOT NULL DEFAULT false,
    "is_sus" BOOLEAN NOT NULL DEFAULT false,
    "specialists" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reference_travel_minutes" INTEGER,
    "reference_distance_km" INTEGER,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "practice_sites_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "practice_sites_physician_id_idx" ON "practice_sites"("physician_id");

CREATE UNIQUE INDEX "practice_sites_one_default_per_physician"
    ON "practice_sites"("physician_id") WHERE "is_default";

ALTER TABLE "practice_sites" ADD CONSTRAINT "practice_sites_physician_id_fkey" FOREIGN KEY ("physician_id") REFERENCES "physicians"("id") ON DELETE CASCADE ON UPDATE CASCADE;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "practice_sites" TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  privilege TEXT;
BEGIN
  FOREACH privilege IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
    IF NOT has_table_privilege('copiloto_app', 'practice_sites', privilege) THEN
      RAISE EXCEPTION 'Migration CC-602: copiloto_app sem % em practice_sites', privilege;
    END IF;
  END LOOP;

  IF has_table_privilege('copiloto_app', 'practice_sites', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-602: copiloto_app não deveria ter TRUNCATE em practice_sites';
  END IF;
END;
$$;
