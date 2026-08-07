-- PI-05: preferência de idioma persistida na conta do médico ('pt-BR' | 'es').
-- Validado na aplicação (não como enum do banco) para não exigir migração a
-- cada novo idioma suportado.
-- AddColumn
ALTER TABLE "physicians" ADD COLUMN "locale" TEXT NOT NULL DEFAULT 'pt-BR';
