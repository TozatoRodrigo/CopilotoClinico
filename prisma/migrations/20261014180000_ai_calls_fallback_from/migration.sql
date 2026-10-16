-- CC-107 — reserva de provedor.
--
-- Quando o provedor de uma etapa fica indisponível (prazo, rede, 429, 5xx ou
-- limite de uso), o gateway repete a chamada uma vez no modelo de reserva.
-- As duas chamadas ficam em ai_calls com o mesmo request_id; a da reserva
-- leva em fallback_from o perfil que caiu. NULL = chamada comum.
--
-- Só adiciona coluna nula: sem reescrita da tabela. O GRANT de INSERT em
-- ai_calls (20261013200000_ai_calls_trace) é por tabela e já cobre a coluna.
--
-- Reversível via:
--   ALTER TABLE "ai_calls" DROP COLUMN "fallback_from";

ALTER TABLE "ai_calls" ADD COLUMN "fallback_from" VARCHAR(32);
