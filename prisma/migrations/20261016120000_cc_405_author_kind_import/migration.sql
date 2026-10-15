-- CC-405 (ADR-019, emenda de 16/10/2026) — autoria `import`: a versão do
-- cartão saiu do conteúdo tipado das ferramentas do ANY, por mapeamento
-- determinístico, sem IA.
--
-- Migration separada de propósito: o valor novo de um enum só pode ser usado
-- (no CHECK de autoria, em 20261016120100_cc_405_any_card_import) depois de
-- confirmado numa transação anterior.
--
-- Reversível: valor de enum não se remove com ALTER TYPE; sem versões
-- `import`, o valor fica sem uso.

ALTER TYPE "KnowledgeCardAuthorKind" ADD VALUE 'import';
