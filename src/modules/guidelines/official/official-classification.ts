import type { OfficialGuidelineKind } from '@prisma/client';
import { z } from 'zod';
import type { ChatMessage } from '../../ai-gateway/providers/provider.interface';
import { PILOT_CENARIOS, SPECIALTIES } from './clinical-vocabulary';
import {
  POPULATIONS,
  type DocumentClassification,
  type SectionedDocument,
} from './official-guideline.types';

/**
 * ADR-010 — Classificação automática de documento oficial.
 *
 * Serve para PONDERAR o retrieval (documento crônico num caso agudo perde
 * prioridade), nunca para excluir documento da base. Fica gravada com a origem
 * (`llm`/`heuristic`) e a justificativa, para a curadoria conferir depois.
 */

export const ClassificationSchema = z.object({
  careSetting: z.enum(['agudo', 'cronico', 'misto', 'indefinido']),
  population: z.enum(POPULATIONS).nullable(),
  specialty: z.enum(SPECIALTIES),
  // Cenário fora da lista é descartado, não invalida a classificação inteira.
  cenarios: z
    .array(z.string())
    .transform((values) =>
      [...new Set(values)].filter((value): value is (typeof PILOT_CENARIOS)[number] =>
        (PILOT_CENARIOS as readonly string[]).includes(value),
      ),
    ),
  rationale: z.string().min(1).max(600),
});

export interface ClassificationInput {
  kind: OfficialGuidelineKind;
  kindLabel: string;
  title: string;
  document: SectionedDocument;
}

export function buildClassificationMessages(input: ClassificationInput): ChatMessage[] {
  const sectionTitles = input.document.sections.map((section) => section.title).join('; ');

  return [
    {
      role: 'system',
      content: `Você classifica documentos oficiais do Ministério da Saúde (Conitec) para um copiloto clínico de PRONTO-SOCORRO. Responda APENAS com um objeto JSON, sem texto fora dele.

Campos:
- "careSetting": onde o documento orienta conduta.
  "agudo" = manejo de condição aguda/emergencial (pronto-socorro, internação, crise).
  "cronico" = acompanhamento ambulatorial, doença crônica, dispensação de medicamento.
  "misto" = orienta tanto o manejo agudo (ex.: exacerbação, crise) quanto o crônico.
  "indefinido" = não é possível dizer pelo texto.
- "population": "adulto", "pediatrico", "todos" ou null.
- "specialty": uma de ${SPECIALTIES.join(', ')}.
- "cenarios": cenários do pronto-socorro para os quais o documento orienta DIRETAMENTE diagnóstico ou conduta. Use SOMENTE valores desta lista: ${PILOT_CENARIOS.join(', ')}. Lista vazia é a resposta correta para a maioria dos documentos crônicos. Não force um encaixe por semelhança de órgão ou sistema.
- "rationale": uma ou duas frases em português justificando careSetting e cenarios.`,
    },
    {
      role: 'user',
      content: `Tipo: ${input.kindLabel}
Título: ${input.title}
CID-10: ${input.document.cid10.join(', ') || 'não informado'}
Seções: ${sectionTitles}

Início do documento:
${input.document.introduction}`,
    },
  ];
}

export function parseClassification(
  raw: string,
  model: string,
): DocumentClassification | { error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(
      raw
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim(),
    );
  } catch {
    return { error: 'resposta não é JSON' };
  }

  const result = ClassificationSchema.safeParse(parsed);
  if (!result.success) {
    return {
      error: result.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
    };
  }

  return { ...result.data, source: 'llm', model };
}

const ACUTE_TITLE =
  /agud|acidente|intoxica|envenena|covid|hospitalar|crise|emerg|choque|sepse|trauma|p[óo]s-exposi[çc][ãa]o|guillain/i;
const PEDIATRIC_TITLE = /crian[çc]|pedi[áa]tric|infantil|neonat|juvenil|adolescent/i;

/**
 * Plano B quando a LLM falha ou está indisponível. Conservadora de
 * propósito: na dúvida, `indefinido` e sem cenário — o documento continua na
 * base, só não ganha prioridade.
 */
export function heuristicClassification(input: {
  kind: OfficialGuidelineKind;
  title: string;
}): DocumentClassification {
  const acute = ACUTE_TITLE.test(input.title);
  const careSetting = acute ? 'agudo' : input.kind === 'ddt' ? 'cronico' : 'indefinido';

  return {
    careSetting,
    population: PEDIATRIC_TITLE.test(input.title) ? 'pediatrico' : null,
    specialty: input.kind === 'ddt' ? 'oncologia' : 'clinica_medica',
    cenarios: [],
    source: 'heuristic',
    rationale: acute
      ? 'Título indica condição aguda (heurística por palavra-chave).'
      : 'Classificação heurística sem sinal de condição aguda no título.',
  };
}
