import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { PrismaService } from '../../config/prisma.service';
import { PS_SYNDROMES, type PsSyndrome } from '../../shared/contracts/clinical';
import {
  UNIFIED_SEARCH_MIN_CHARS,
  type CardSearchHit,
  type CaseSearchHit,
  type ProtocolSearchHit,
  type UnifiedSearchGroup,
  type UnifiedSearchGroupResult,
  type UnifiedSearchResponse,
} from '../../shared/contracts/search';
import { maskPII } from '../copilot/guardrails/pii-filter';
import { GuidelinesService } from '../guidelines/guidelines.service';
import {
  REVIEWED_CARD_SELECT,
  toReviewedCard,
} from '../knowledge-cards/card-retrieval/reviewed-card-view';
import { rankCards, type CardSearchCandidate } from './card-matching';
import { parseCaseQuery } from './case-query';
import type { UnifiedSearchQueryInput } from './schemas/search.schemas';
import { matchSyndromes } from './syndrome-terms';

/** Trechos lidos da busca por palavra das diretrizes: vários são do mesmo documento. */
const PROTOCOL_CHUNK_CANDIDATES = 40;
/** Cartões conferidos pela regra do cartão publicado além do limite (algum pode ter caído). */
const CARD_CONFIRM_SLACK = 3;

const REDACTION_TAG = /\[REDACTED_[A-Z]+\]/g;
const SyndromeSchema = z.enum(PS_SYNDROMES);

/**
 * O texto que cartões e protocolos recebem: a busca com o dado pessoal
 * mascarado (CPF, telefone, e-mail…) e sem a marca da máscara, que não é
 * termo de busca.
 */
export function maskedSearchText(query: string): { text: string; masked: boolean } {
  const { redacted, hasPII } = maskPII(query);
  return { text: redacted.replace(REDACTION_TAG, ' ').replace(/\s+/g, ' ').trim(), masked: hasPII };
}

function errorKind(error: unknown): string {
  if (error instanceof Prisma.PrismaClientKnownRequestError) return `prisma_${error.code}`;
  return error instanceof Error ? error.name : typeof error;
}

/**
 * CC-502 — busca única do ⌘K: cartões revisados, protocolos e os casos do
 * médico, cada grupo com o próprio limite e só o que o médico pode ver.
 *
 * - Cartões: publicados, aprovados por médico com CRM verificado, dentro da
 *   validade, globais ou da instituição do médico (ADR-009) — a mesma regra
 *   do cartão aberto pelo "Revisado por" (`toReviewedCard`).
 * - Protocolos: documentos da base de diretrizes achados pelo título ou pela
 *   busca por palavra que já existe (`searchChunks`), globais ou da
 *   instituição do médico.
 * - Casos: só os do médico, pela data, pela síndrome do último entendimento
 *   ou pelo rótulo. Nunca pelo texto do caso.
 *
 * Cartões e protocolos recebem a busca mascarada. Nada da busca vai para o
 * log: só o tamanho, se houve máscara e quantos itens cada grupo achou.
 */
@Injectable()
export class UnifiedSearchService {
  private readonly logger = new Logger(UnifiedSearchService.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(GuidelinesService) private readonly guidelines: GuidelinesService,
  ) {}

  async search(
    physicianId: string,
    query: UnifiedSearchQueryInput,
  ): Promise<UnifiedSearchResponse> {
    const started = Date.now();
    const now = new Date();
    const { text, masked } = maskedSearchText(query.q);
    const institutionIds = this.institutionIds(physicianId);

    const [cards, protocols, cases] = await Promise.all([
      this.group('cards', async () =>
        this.searchCards(text, await institutionIds, query.limit, now),
      ),
      this.group('protocols', async () =>
        this.searchProtocols(text, await institutionIds, query.limit),
      ),
      this.group('cases', () => this.searchCases(physicianId, query.q, query.limit, now)),
    ]);

    this.logger.log(
      `UNIFIED_SEARCH chars=${query.q.length} masked=${masked} ` +
        `cards=${count(cards)} protocols=${count(protocols)} cases=${count(cases)} ` +
        `ms=${Date.now() - started}`,
    );
    return { cards, protocols, cases };
  }

  private async institutionIds(physicianId: string): Promise<string[]> {
    const links = await this.prisma.physicianInstitution.findMany({
      where: { physicianId },
      select: { institutionId: true },
    });
    return links.map((link) => link.institutionId);
  }

  /** Um grupo que falha vira `error` só nele; o erro vai para o Sentry sem a busca. */
  private async group<T>(
    name: UnifiedSearchGroup,
    run: () => Promise<T[]>,
  ): Promise<UnifiedSearchGroupResult<T>> {
    try {
      return { status: 'ok', items: await run() };
    } catch (error) {
      // A mensagem do banco pode repetir o valor do parâmetro: só o tipo do erro.
      const kind = errorKind(error);
      this.logger.error(`UNIFIED_SEARCH_FAILED group=${name} kind=${kind}`);
      Sentry.captureMessage(`UNIFIED_SEARCH_FAILED group=${name} kind=${kind}`, 'error');
      return { status: 'error' };
    }
  }

  /**
   * Os cartões visíveis, só tema, pergunta, síndrome e chave de origem (sem o
   * conteúdo inteiro), ranqueados aqui; os mais relevantes passam de novo
   * pela regra do cartão publicado, com o conteúdo validado.
   */
  private async searchCards(
    text: string,
    institutionIds: readonly string[],
    limit: number,
    now: Date,
  ): Promise<CardSearchHit[]> {
    if (text.length < UNIFIED_SEARCH_MIN_CHARS) return [];
    const candidates = await this.prisma.$queryRaw<CardSearchCandidate[]>`
      SELECT kc.id, kc.topic, kc.syndrome, kc.source_key AS "sourceKey",
             COALESCE(kv.content->>'question', '') AS question
        FROM knowledge_cards kc
        JOIN knowledge_card_versions kv ON kv.id = kc.published_version_id
        JOIN physicians p ON p.id = kv.reviewer_id
       WHERE kc.status = 'published'
         AND kv.review_decision = 'approved'
         AND kv.reviewed_at IS NOT NULL
         AND kv.valid_until > ${now}
         AND p.crm_verified = true
         AND (kc.institution_id IS NULL OR kc.institution_id = ANY(${[...institutionIds]}::uuid[]))`;

    const ranked = rankCards(candidates, text).slice(0, limit + CARD_CONFIRM_SLACK);
    if (ranked.length === 0) return [];

    const rows = await this.prisma.knowledgeCard.findMany({
      where: { id: { in: ranked.map((candidate) => candidate.id) } },
      select: REVIEWED_CARD_SELECT,
    });
    const visible = new Set(institutionIds);
    const confirmed = new Map(
      rows.flatMap((row) => {
        const card = toReviewedCard(row);
        const valid =
          card &&
          new Date(card.validUntil).getTime() > now.getTime() &&
          (card.institutionId === null || visible.has(card.institutionId));
        return valid ? [[card.cardId, card] as const] : [];
      }),
    );
    return ranked
      .flatMap((candidate) => {
        const card = confirmed.get(candidate.id);
        return card
          ? [
              {
                id: card.cardId,
                topic: card.topic,
                question: card.content.question,
                syndrome: card.syndrome,
              },
            ]
          : [];
      })
      .slice(0, limit);
  }

  /**
   * Documentos (não trechos): primeiro os que têm a busca no título — acha
   * enquanto o médico digita ("anafil") —, depois os da busca por palavra no
   * texto. Um por título.
   */
  private async searchProtocols(
    text: string,
    institutionIds: readonly string[],
    limit: number,
  ): Promise<ProtocolSearchHit[]> {
    if (text.length < UNIFIED_SEARCH_MIN_CHARS) return [];
    const [byTitle, byText] = await Promise.all([
      this.prisma.guidelineChunk.findMany({
        where: {
          status: 'approved',
          validTo: null,
          source: { contains: text, mode: Prisma.QueryMode.insensitive },
          OR: [{ institutionId: null }, { institutionId: { in: [...institutionIds] } }],
        },
        distinct: ['source'],
        orderBy: { source: 'asc' },
        take: limit,
        select: { source: true, sourceVersion: true, specialty: true, institutionId: true },
      }),
      this.guidelines.searchChunks(text, undefined, PROTOCOL_CHUNK_CANDIDATES, institutionIds),
    ]);

    const hits = new Map<string, ProtocolSearchHit>();
    for (const chunk of [...byTitle, ...byText]) {
      if (hits.has(chunk.source)) continue;
      hits.set(chunk.source, {
        source: chunk.source,
        sourceVersion: chunk.sourceVersion,
        specialty: chunk.specialty,
        institutional: chunk.institutionId !== null,
      });
    }
    return [...hits.values()].slice(0, limit);
  }

  /**
   * Só os casos do médico. A data filtra o dia (em Brasília); o resto da
   * busca acha pelo rótulo ou pela síndrome do último entendimento. A busca
   * não é mascarada aqui: o rótulo é um identificador opaco (LGPD-001), e a
   * consulta só olha os casos de quem pergunta.
   */
  private async searchCases(
    physicianId: string,
    query: string,
    limit: number,
    now: Date,
  ): Promise<CaseSearchHit[]> {
    const { day, text } = parseCaseQuery(query, now);
    if (!day && text.length < UNIFIED_SEARCH_MIN_CHARS) return [];

    const syndromes = text ? matchSyndromes(text) : [];
    const bySyndrome =
      syndromes.length > 0 ? await this.latestSyndromes(physicianId, { syndromes }) : new Map();

    const where: Prisma.EncounterWhereInput = {
      physicianId,
      ...(day ? { createdAt: { gte: day.from, lt: day.to } } : {}),
      ...(text
        ? {
            OR: [
              { patientRef: { contains: text, mode: Prisma.QueryMode.insensitive } },
              ...(bySyndrome.size > 0 ? [{ id: { in: [...bySyndrome.keys()] } }] : []),
            ],
          }
        : {}),
    };
    const encounters = await this.prisma.encounter.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        patientRef: true,
        chiefComplaint: true,
        status: true,
        createdAt: true,
      },
    });
    if (encounters.length === 0) return [];

    const missing = encounters.filter((encounter) => !bySyndrome.has(encounter.id));
    const syndromeOf =
      missing.length > 0
        ? new Map([
            ...bySyndrome,
            ...(await this.latestSyndromes(physicianId, {
              encounterIds: missing.map((encounter) => encounter.id),
            })),
          ])
        : bySyndrome;

    return encounters.map((encounter) => ({
      id: encounter.id,
      patientRef: encounter.patientRef,
      chiefComplaint: encounter.chiefComplaint,
      status: encounter.status,
      createdAt: encounter.createdAt.toISOString(),
      syndrome: syndromeOf.get(encounter.id) ?? null,
    }));
  }

  /**
   * Síndrome do último entendimento de cada caso do médico (ADR-013): a
   * análise mais recente que tem entendimento. A que falhou na validação e a
   * de antes da Fase 1 não têm, e ficam de fora. Filtra pelas síndromes ou
   * pelos casos pedidos.
   */
  private async latestSyndromes(
    physicianId: string,
    filter: { syndromes: readonly PsSyndrome[] } | { encounterIds: readonly string[] },
  ): Promise<Map<string, PsSyndrome>> {
    const encounterScope =
      'encounterIds' in filter
        ? Prisma.sql`AND ai.encounter_id = ANY(${[...filter.encounterIds]}::uuid[])`
        : Prisma.empty;
    const syndromeScope =
      'syndromes' in filter
        ? Prisma.sql`WHERE latest.syndrome = ANY(${[...filter.syndromes]}::text[])`
        : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ encounterId: string; syndrome: string }>>`
      SELECT latest."encounterId", latest.syndrome
        FROM (
          SELECT DISTINCT ON (ai.encounter_id)
                 ai.encounter_id AS "encounterId",
                 ai.raw_output->'understanding'->>'syndrome' AS syndrome
            FROM ai_interactions ai
            JOIN encounters e ON e.id = ai.encounter_id
           WHERE e.physician_id = ${physicianId}::uuid
             AND ai.raw_output->'understanding'->>'syndrome' IS NOT NULL
             ${encounterScope}
           ORDER BY ai.encounter_id, ai.created_at DESC
        ) latest
       ${syndromeScope}`;

    const syndromes = new Map<string, PsSyndrome>();
    for (const row of rows) {
      const syndrome = SyndromeSchema.safeParse(row.syndrome);
      if (syndrome.success) syndromes.set(row.encounterId, syndrome.data);
    }
    return syndromes;
  }
}

function count(result: UnifiedSearchGroupResult<unknown>): string {
  return result.status === 'ok' ? String(result.items.length) : 'error';
}
