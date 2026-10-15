import type { CaseUnderstanding } from '../../../shared/contracts/clinical';

/**
 * F1 — etapa de pesquisa (`COPILOT_KNOWLEDGE_SOURCE=web`). Texto aprovado no
 * plano da Fase 1; mudanças aqui mudam o que o gabarito clínico mede.
 */
export const WEB_RESEARCH_SYSTEM_PROMPT = `You are the evidence-research stage of a clinical copilot for emergency physicians in Brazil. Find, in trusted sources, the specific guidance the physician needs for THIS presentation: the initial management of the syndrome and, for each cannot-miss hypothesis, the decisive criteria, time windows, contraindications and doses. Search only for what a guideline answers — never include patient details in a query. Prefer Brazilian official sources (Ministério da Saúde, Conitec, protocolos do SAMU 192) and Brazilian specialty societies; use international guidelines (AHA/ASA, ESC, NICE, WHO, Surviving Sepsis Campaign and similar) when Brazilian guidance is missing or older, and prefer the most recent version. Then write a concise evidence summary in Portuguese (Brazil): one short paragraph per topic, every claim backed by the page it came from. If you cannot find a trusted source for something, say so instead of guessing.`;

/** Saída de modelo derivada de texto não confiável: nada nela fecha a tag. */
function escapeTag(text: string): string {
  return text.replace(/</g, '&lt;');
}

function bulletList(items: string[]): string {
  return items.map((item) => `- ${escapeTag(item)}`).join('\n');
}

/**
 * Só o que uma diretriz responde: a síndrome, as hipóteses que não podem
 * passar (com o exame que decide), os dados que separam hipóteses e as
 * consultas sugeridas. Nunca o texto do caso, a representação do problema,
 * os dados estruturados nem o porquê de cada hipótese — é onde moram idade,
 * sinais vitais e o resto do que identifica o paciente.
 */
export function buildResearchPrompt(understanding: CaseUnderstanding): string {
  const syndrome = understanding.syndromeNote
    ? `${understanding.syndrome} (${understanding.syndromeNote})`
    : understanding.syndrome;
  const sections = [
    `Síndrome de pronto-socorro: ${escapeTag(syndrome)}`,
    understanding.cannotMiss.length > 0
      ? `Hipóteses que não podem passar, da mais grave para a menos grave:\n${bulletList(
          understanding.cannotMiss.map(
            (item) => `${item.hypothesis} — confirma ou afasta: ${item.confirmOrRuleOut}`,
          ),
        )}`
      : '',
    understanding.missingDiscriminators.length > 0
      ? `Dados que separam hipóteses de conduta diferente:\n${bulletList(
          understanding.missingDiscriminators.map(
            (item) => `${item.data} — separa: ${item.separates.join(' × ')}`,
          ),
        )}`
      : '',
    `Consultas sugeridas:\n${bulletList(understanding.searchQueries)}`,
  ].filter(Boolean);

  return `<research_topics type="MODEL_DERIVED_FROM_CASE">
${sections.join('\n\n')}
</research_topics>

Research the guidance for this presentation now.`;
}
