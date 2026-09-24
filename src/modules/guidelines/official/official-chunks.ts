import { chunkText } from '../ingestion/chunking';
import type {
  ConitecListingItem,
  DocumentClassification,
  SectionedDocument,
} from './official-guideline.types';

/**
 * ADR-010 — Um documento seccionado vira chunks prontos para embedding.
 *
 * Cada chunk começa com um cabeçalho de contexto — `[PCDT · Asma · 7.
 * TRATAMENTO]` — porque um trecho como "iniciar com 500 mg a cada 8 horas" não
 * diz de que doença nem de que etapa fala. O cabeçalho vai no texto (e no
 * embedding) de propósito: é o que permite à busca e à LLM saberem de onde o
 * trecho veio.
 */

export interface OfficialChunk {
  text: string;
  metadata: OfficialChunkMetadata;
}

export interface OfficialChunkMetadata {
  origin: 'official_unreviewed';
  kind: ConitecListingItem['kind'];
  documentKey: string;
  title: string;
  section: string;
  sectionNumber: number | null;
  careSetting: DocumentClassification['careSetting'];
  cenarios: string[];
  url: string;
  normativeAct: string | null;
  // Lidos por output-validator.ts em todo chunk recuperado.
  cenario: null;
  subtipo: null;
  chunkIndex: number;
  charStart: number;
  charEnd: number;
}

const DATE_FORMAT = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' });

export function formatDate(date: Date): string {
  return DATE_FORMAT.format(date);
}

export function officialSource(kindLabel: string, title: string): string {
  return `${kindLabel} — ${title}`;
}

/**
 * Versão legível: a portaria sem a data de publicação entre parênteses, mais a
 * data de alteração do anexo quando houver. Quando o PDF muda sem nada disso
 * mudar na lista, `collectedAt` diferencia as versões.
 */
export function officialSourceVersion(
  item: Pick<ConitecListingItem, 'normativeAct' | 'annexUpdatedAt'>,
  collectedAt?: Date,
): string {
  const act =
    item.normativeAct
      ?.split('(')[0]
      ?.replace(/[\s-]+$/, '')
      .trim() || 'Sem portaria na lista';
  const parts = [act];
  if (item.annexUpdatedAt) parts.push(`anexo alterado em ${formatDate(item.annexUpdatedAt)}`);
  if (collectedAt) parts.push(`versão coletada em ${formatDate(collectedAt)}`);
  return parts.join(' · ');
}

export function buildOfficialChunks(input: {
  item: ConitecListingItem;
  kindLabel: string;
  document: SectionedDocument;
  classification: DocumentClassification;
  sourceVersion: string;
}): OfficialChunk[] {
  const { item, kindLabel, document, classification } = input;
  const source = officialSource(kindLabel, item.title);
  const chunks: OfficialChunk[] = [];

  for (const section of document.sections.filter((s) => s.included)) {
    const sectionLabel =
      section.number === null ? section.title : `${section.number}. ${section.title}`;
    const header = `[${kindLabel} · ${item.title} · ${sectionLabel}]`;

    const pieces = chunkText({
      text: section.text,
      source,
      sourceVersion: input.sourceVersion,
      specialty: classification.specialty,
    });

    for (const piece of pieces) {
      chunks.push({
        text: `${header}\n${piece.text}`,
        metadata: {
          origin: 'official_unreviewed',
          kind: item.kind,
          documentKey: item.documentKey,
          title: item.title,
          section: sectionLabel,
          sectionNumber: section.number,
          careSetting: classification.careSetting,
          cenarios: classification.cenarios,
          url: item.documentUrl,
          normativeAct: item.normativeAct,
          cenario: null,
          subtipo: null,
          chunkIndex: chunks.length,
          charStart: piece.metadata.charStart,
          charEnd: piece.metadata.charEnd,
        },
      });
    }
  }

  return chunks;
}
