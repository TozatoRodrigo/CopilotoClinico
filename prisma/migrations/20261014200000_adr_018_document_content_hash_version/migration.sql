-- ADR-018: versão do algoritmo do selo de integridade dos documentos.
--
-- O content_hash v1 (CLIN-003) passava as chaves da raiz como replacer do
-- JSON.stringify, que filtra as chaves em todos os níveis: os itens de
-- `medicamentos` da prescrição entravam no hash como `{}`. O v2 usa JSON
-- canônico (RFC 8785). Documentos já selados mantêm o hash v1 — re-selar
-- conteúdo confirmado no passado validaria qualquer alteração feita depois —
-- e continuam verificáveis com o algoritmo legado.
--
-- Todo hash existente é v1. O CHECK impede gravar hash sem versão: durante o
-- deploy, a API antiga falha ao GERAR documento (erro visível, não selo
-- ambíguo) até o container novo subir; confirmar continua funcionando.
ALTER TABLE "documents" ADD COLUMN "content_hash_version" SMALLINT;

UPDATE "documents" SET "content_hash_version" = 1 WHERE "content_hash" IS NOT NULL;

ALTER TABLE "documents" ADD CONSTRAINT "documents_content_hash_version_paired"
  CHECK (("content_hash" IS NULL) = ("content_hash_version" IS NULL));
