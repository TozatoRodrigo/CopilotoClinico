import type { CopilotOutput } from '../../copilot/guardrails/output-validator';

export interface SbarDocument {
  situation: string;
  background: string;
  assessment: string;
  recommendation: string;
}

/**
 * PI-04 — SBAR que blinda a transição de cuidado.
 *
 * Origem: viés de gestor do Dr. Ripardo em reunião — "você se engata muito
 * em detalhes que às vezes não interessam" na passagem de plantão, e o
 * desfecho que isso pode causar: "o cara que recebeu o doente não olhou
 * praquilo e o doente foi agravando... até todo mundo se tocar, o avião já
 * tinha embicado". O insight: o problema não é falta de informação, é
 * excesso de informação irrelevante escondendo o que importa. Três seções
 * novas dentro de "Recommendation" (mantendo a estrutura SBAR canônica —
 * documento clínico reconhecido, não formato inventado), todas derivadas
 * do que a análise já produziu — nenhuma coleta de dado nova.
 */

/**
 * Pendências: o que foi solicitado/sugerido e ainda não está confirmado.
 * Três fontes, sem duplicar: exames pedidos (category diagnostic),
 * qualquer recomendação ainda preliminary (sujeita a mudar quando a
 * pergunta correspondente for respondida), e perguntas do copiloto que
 * ficaram sem resposta neste turno — exatamente as lacunas conhecidas do
 * caso que o próximo plantonista precisa saber que existem.
 */
function buildPendencias(output: CopilotOutput): string[] {
  const items: string[] = [];
  const seenActions = new Set<string>();

  for (const rec of output.recommendations ?? []) {
    if (rec.category === 'diagnostic' || rec.preliminary) {
      if (!seenActions.has(rec.action)) {
        seenActions.add(rec.action);
        items.push(rec.action);
      }
    }
  }

  // Defensive: `rawOutput` vem do banco como `Prisma.JsonValue` sem
  // re-validação via CopilotOutputSchema (só é validado na escrita,
  // ver orchestrator.service.ts). Interações persistidas antes de
  // clarifyingQuestions existir no schema legitimamente não têm este
  // campo — degradar para lista vazia em vez de estourar.
  for (const question of output.clarifyingQuestions ?? []) {
    items.push(`Aguardando resposta: ${question.question}`);
  }

  return items;
}

/**
 * Vigilâncias: red flags viram gatilhos de reavaliação no formato
 * "se X, então Y" — acionável, não descritivo. É o que quem recebe o
 * plantão precisa observar sem reconstruir o raciocínio clínico do zero.
 */
function buildVigilancias(output: CopilotOutput): string[] {
  // Mesmo motivo defensivo de buildPendencias — ver comentário lá.
  return (output.redFlags ?? []).map((flag) => `Se ${flag.finding.toLowerCase()} → ${flag.action}`);
}

/**
 * "Se piorar": conduta imediata esperada em caso de deterioração — mesmo
 * bar de risco de vida usado no resto da análise (red flags critical) mais
 * as recomendações de estabilização já geradas. É a informação que mais
 * se perde numa passagem apressada e a que mais custa quando falta.
 */
function buildSePiorar(output: CopilotOutput): string[] {
  const items: string[] = [];
  for (const flag of output.redFlags ?? []) {
    if (flag.severity === 'critical') items.push(flag.action);
  }
  for (const rec of output.recommendations ?? []) {
    if (rec.category === 'stabilization' && !items.includes(rec.action)) {
      items.push(rec.action);
    }
  }
  return items;
}

/** Omite a seção inteira quando vazia — SBAR longo demais reproduz o problema que se quer resolver. */
function appendSection(base: string, title: string, items: string[]): string {
  if (items.length === 0) return base;
  const block = `\n\n${title}:\n${items.map((item) => `- ${item}`).join('\n')}`;
  return base + block;
}

export function generateSBAR(caseText: string, copilotOutput: CopilotOutput): SbarDocument {
  const topRecs = copilotOutput.recommendations
    .slice(0, 5)
    .map((r) => `${r.action} [confiança: ${Math.round(r.confidence * 100)}%]`)
    .join('; ');

  let recommendation = topRecs || 'Nenhuma recomendação específica';
  recommendation = appendSection(recommendation, 'Pendências', buildPendencias(copilotOutput));
  recommendation = appendSection(recommendation, 'Vigilâncias', buildVigilancias(copilotOutput));
  recommendation = appendSection(recommendation, 'Se piorar', buildSePiorar(copilotOutput));

  return {
    situation: `Caso clínico: ${caseText.substring(0, 200)}`,
    background: copilotOutput.reasoning,
    assessment: copilotOutput.uncertainty
      ? `ALERTA: ${copilotOutput.uncertaintyReason ?? 'Evidência insuficiente'} — decisão clínica necessária`
      : `${copilotOutput.recommendations.length} recomendações com base em diretrizes`,
    recommendation,
  };
}
