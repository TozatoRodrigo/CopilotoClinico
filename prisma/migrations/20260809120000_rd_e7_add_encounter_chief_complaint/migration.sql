-- RD-E7: campo de queixa principal exibido como título nas listas de casos
-- (Plantão, Casos), no lugar de patientRef. Populado automaticamente pelo
-- OrchestratorService a partir da primeira análise de IA do encontro (ver
-- analyze()/analyzeStream() em src/modules/copilot/orchestrator) — nunca
-- preenchido manualmente. Nullable: casos ainda em captura, sem análise,
-- não têm queixa derivada ainda; o frontend cai de volta para patientRef.
-- AddColumn
ALTER TABLE "encounters" ADD COLUMN "chief_complaint" VARCHAR(140);
