-- CC-012 — privilégios que a eliminação LGPD (POST /lgpd/erasure) precisa na
-- role de runtime (copiloto_app). Só GRANT: nenhuma tabela é reescrita.
--
-- 1. ai_calls: a API só inseria e lia (20261013200000_ai_calls_trace). A
--    eliminação passa a desvincular as chamadas do médico (o custo agregado
--    fica), então ganha UPDATE só nas três colunas de vínculo. Etapa, modelo,
--    tokens, custo, latência e desfecho continuam fora do alcance da API, e
--    DELETE continua negado.
-- 2. Tabelas que a eliminação passou a apagar: DELETE explícito, sem depender
--    dos DEFAULT PRIVILEGES da AUD-002, que só valem quando a migration roda
--    com a role que os declarou. Onde o privilégio já existe, nada muda.
--
-- Reversível via:
--   REVOKE UPDATE ("physician_id", "encounter_id", "request_id") ON TABLE "ai_calls" FROM copiloto_app;
--   (os DELETE explícitos podem ficar: a API já apagava códigos de MFA e o
--   resto vinha dos DEFAULT PRIVILEGES)

GRANT UPDATE ("physician_id", "encounter_id", "request_id") ON TABLE "ai_calls" TO copiloto_app;

GRANT DELETE ON TABLE
  "mfa_backup_codes",
  "crm_verification_requests",
  "physician_institutions",
  "login_security_states"
TO copiloto_app;

-- Smoke check da própria migration, um privilégio por chamada.
DO $$
DECLARE
  link_column TEXT;
  erased_table TEXT;
BEGIN
  FOREACH link_column IN ARRAY ARRAY['physician_id', 'encounter_id', 'request_id'] LOOP
    IF NOT has_column_privilege('copiloto_app', 'ai_calls', link_column, 'UPDATE') THEN
      RAISE EXCEPTION 'Migration CC-012: copiloto_app sem UPDATE em ai_calls.%', link_column;
    END IF;
  END LOOP;

  -- Privilégio de coluna não vale para a tabela inteira: custo e tokens seguem
  -- sem UPDATE.
  IF has_table_privilege('copiloto_app', 'ai_calls', 'UPDATE')
    OR has_column_privilege('copiloto_app', 'ai_calls', 'cost_usd', 'UPDATE')
    OR has_table_privilege('copiloto_app', 'ai_calls', 'DELETE')
    OR has_table_privilege('copiloto_app', 'ai_calls', 'TRUNCATE') THEN
    RAISE EXCEPTION 'Migration CC-012: copiloto_app só deveria alterar as colunas de vínculo de ai_calls';
  END IF;

  FOREACH erased_table IN ARRAY ARRAY[
    'mfa_backup_codes',
    'crm_verification_requests',
    'physician_institutions',
    'login_security_states'
  ] LOOP
    IF NOT has_table_privilege('copiloto_app', erased_table, 'DELETE') THEN
      RAISE EXCEPTION 'Migration CC-012: copiloto_app sem DELETE em %', erased_table;
    END IF;
  END LOOP;
END;
$$;
