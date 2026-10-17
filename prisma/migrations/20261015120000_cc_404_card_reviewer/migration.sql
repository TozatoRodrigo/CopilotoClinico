-- CC-404 (ADR-019, adendo) — papel de revisor de cartões.
--
-- Quem revisa os cartões no celular são médicos do piloto que não têm — nem
-- devem ter — papel COMPLIANCE/ADMIN e a flag de curador: o console admin dá
-- acesso a diretrizes, feedback, verificação de CRM e ao pedido de rascunho
-- à IA. `is_card_reviewer` dá acesso só à fila de revisão de cartões
-- (`/v1/review/knowledge-cards`), e o guard dela também exige CRM verificado.
--
-- Mesmo modelo provisório do `is_curator` (KB-002): coluna booleana até
-- existir RBAC completo, concedida à mão pelo runbook. A coluna herda os
-- GRANTs de `physicians` (a role da API já lê e atualiza a tabela).
--
-- Reversível via:
--   ALTER TABLE "physicians" DROP COLUMN "is_card_reviewer";

ALTER TABLE "physicians" ADD COLUMN "is_card_reviewer" BOOLEAN NOT NULL DEFAULT false;
