-- CC-014: especialidade do médico, escolhida no onboarding ou no perfil. Antes
-- o PATCH /auth/me descartava o campo sem erro e a escolha se perdia.
-- Slug de physicianSpecialtyValues (src/shared/contracts/clinical.ts), validado
-- na aplicação, como o locale (PI-05): especialidade nova não pede migração.
-- Nulo para quem ainda não escolheu. A tabela já tem os GRANTs da role de
-- runtime; coluna nova não precisa de outro.
--
-- Reversível via:
--   ALTER TABLE "physicians" DROP COLUMN "specialty";

-- AddColumn
ALTER TABLE "physicians" ADD COLUMN "specialty" VARCHAR(64);
