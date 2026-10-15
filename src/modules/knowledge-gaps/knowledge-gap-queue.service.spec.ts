import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { AuditService } from '../audit/audit.service';
import { sha256Hex } from '../audit/audit-hash';
import type { KnowledgeCardDraftService } from '../knowledge-cards/drafting/card-draft.service';
import type { PsSyndrome } from '../../shared/contracts/clinical';
import type { KnowledgeCardDraftResult } from '../../shared/contracts/knowledge-cards';
import type { KnowledgeGapSource } from '../../shared/contracts/knowledge-gaps';
import { createGapStore } from '../../../tests/fixtures/knowledge-gaps';
import { KnowledgeGapQueueService } from './knowledge-gap-queue.service';
import { KnowledgeGapsService } from './knowledge-gaps.service';

const NOW = new Date('2026-10-16T12:00:00.000Z');
const DAY = 86_400_000;
const MINUTE = 60_000;
/** O relatório fecha a janela um segundo depois das ações do teste (janela [de, até)). */
const REPORT_END = new Date(NOW.getTime() + 1000);
const CURATOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DRAFT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

function draftResult(cardIds: string[]): KnowledgeCardDraftResult {
  return {
    draft: {
      id: DRAFT_ID,
      topic: 'tema',
      syndrome: null,
      institutionId: null,
      status: 'completed',
      requestedModel: 'fake-model',
      servedModel: 'fake-model',
      promptSha256: 'a'.repeat(64),
      sourceContentSha256: 'b'.repeat(64),
      sourceChunkIds: [],
      cardsAccepted: cardIds.length,
      cardsRejected: 1,
      rejections: [],
      failureReason: null,
      costUsd: 0.21,
      latencyMs: 1200,
      createdAt: NOW.toISOString(),
    },
    cardIds,
  };
}

/**
 * CC-409 — a fila do curador: ordem por frequência e gravidade, gerar
 * rascunho (IA falsa), descartar com motivo, reabrir, fechar ao publicar e o
 * relatório da semana.
 */
describe('KnowledgeGapQueueService', () => {
  let store: ReturnType<typeof createGapStore>;
  let clock: Date;
  let audit: { log: ReturnType<typeof vi.fn> };
  let env: Record<string, string>;
  let drafts: { draft: ReturnType<typeof vi.fn> };
  let gaps: KnowledgeGapsService;
  let queue: KnowledgeGapQueueService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    clock = NOW;
    store = createGapStore(() => clock);
    audit = { log: vi.fn().mockResolvedValue({}) };
    env = { KNOWLEDGE_CARDS_DRAFT_ENABLED: 'true' };
    drafts = { draft: vi.fn().mockResolvedValue(draftResult(['card-1'])) };
    gaps = new KnowledgeGapsService(store.prisma, audit as unknown as AuditService);
    queue = new KnowledgeGapQueueService(
      store.prisma,
      drafts as unknown as KnowledgeCardDraftService,
      audit as unknown as AuditService,
      { get: (key: string) => env[key] } as unknown as ConfigService,
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /** `times` lacunas do mesmo tema, um minuto entre elas, a última `daysAgo` dias antes de agora. */
  async function seed(
    query: string,
    times: number,
    {
      syndrome = null,
      source = 'quick_question',
      daysAgo = 0,
      note,
    }: {
      syndrome?: PsSyndrome | null;
      source?: KnowledgeGapSource;
      daysAgo?: number;
      note?: string;
    } = {},
  ): Promise<string> {
    let groupId = '';
    for (let i = 0; i < times; i++) {
      clock = new Date(NOW.getTime() - daysAgo * DAY - (times - i) * MINUTE);
      const result = await gaps.record({
        source,
        interactionId: source === 'quick_question' ? null : `int-${query}-${i}`,
        syndrome,
        searchQueries: [query],
        ...(note ? { note } : {}),
      });
      groupId = result.groupId;
    }
    clock = NOW;
    return groupId;
  }

  describe('list', () => {
    it('ordena por ocorrências × gravidade da síndrome e conta por status', async () => {
      const vertigo = await seed('vertigem posicional manobra de Epley', 5, {
        syndrome: 'vertigem',
      });
      const shock = await seed('noradrenalina no choque séptico', 2, {
        syndrome: 'choque',
        source: 'decision_no_card',
      });
      const dengue = await seed('hidratação na dengue grupo C', 3, { syndrome: 'febre' });

      const page = await queue.list({ limit: 20, offset: 0 });

      // choque: 2 × 3 = 6 (tempo-crítica); dengue: 3 × 2 = 6 (urgente); vertigem: 5 × 1.
      expect(page.items.map((item) => item.id)).toEqual([shock, dengue, vertigo]);
      expect(page.items[0]).toMatchObject({
        topic: 'noradrenalina no choque séptico',
        syndrome: 'choque',
        severity: 'time_critical',
        priority: 6,
        status: 'open',
        occurrences: 2,
        occurrencesLast7Days: 2,
        sources: { decision_no_card: 2 },
        queries: ['noradrenalina no choque séptico'],
      });
      expect(page).toMatchObject({
        total: 3,
        countsByStatus: { open: 3, drafting: 0, covered: 0, dismissed: 0 },
        draftEnabled: true,
      });
    });

    it('conta contagem, primeira e última ocorrência e a semana a partir das lacunas', async () => {
      await seed('ceftriaxona na meningite bacteriana', 1, { syndrome: 'febre', daysAgo: 20 });
      await seed('meningite bacteriana: ceftriaxona', 2, {
        syndrome: 'febre',
        source: 'physician_not_found',
        note: 'Faltou a dose',
      });

      const [item] = (await queue.list({ limit: 20, offset: 0 })).items;

      expect(item).toMatchObject({
        occurrences: 3,
        occurrencesLast7Days: 2,
        sources: { quick_question: 1, physician_not_found: 2 },
        firstSeenAt: new Date(NOW.getTime() - 20 * DAY - MINUTE).toISOString(),
        notes: ['Faltou a dose'],
      });
      expect(item!.queries[0]).toBe('meningite bacteriana: ceftriaxona');
    });

    it('filtra por status e pagina', async () => {
      await seed('adrenalina na anafilaxia', 2, { syndrome: 'reacao-alergica' });
      const dismissed = await seed('atestado médico', 1);
      await queue.dismiss(CURATOR_ID, dismissed, { reason: 'Administrativo, não é cartão' });

      const page = await queue.list({ status: 'dismissed', limit: 20, offset: 0 });

      expect(page.items.map((item) => item.id)).toEqual([dismissed]);
      expect(page.total).toBe(1);
      expect(page.countsByStatus).toMatchObject({ open: 1, dismissed: 1 });
      expect((await queue.list({ limit: 1, offset: 1 })).items).toHaveLength(1);
    });

    it('avisa a tela quando o rascunho por IA está desligado', async () => {
      env = {};
      await expect(queue.list({ limit: 20, offset: 0 })).resolves.toMatchObject({
        draftEnabled: false,
      });
    });
  });

  describe('draft — gerar rascunho de cartão', () => {
    it('com a flag desligada responde 503 sem chamar a IA nem mudar a lacuna', async () => {
      env = {};
      const groupId = await seed('adrenalina na anafilaxia', 1);

      await expect(queue.draft(CURATOR_ID, groupId, { submitForReview: true })).rejects.toThrow(
        ServiceUnavailableException,
      );
      expect(drafts.draft).not.toHaveBeenCalled();
      expect(store.groups[0]).toMatchObject({ status: 'open', draftId: null });
    });

    it('chama o rascunho do CC-403 com o tema e a síndrome da lacuna e passa a "em rascunho"', async () => {
      const groupId = await seed('adrenalina na anafilaxia', 2, { syndrome: 'reacao-alergica' });

      const response = await queue.draft(CURATOR_ID, groupId, { submitForReview: true });

      expect(drafts.draft).toHaveBeenCalledWith({
        topic: 'adrenalina na anafilaxia',
        syndrome: 'reacao-alergica',
        institutionId: null,
        requestedBy: CURATOR_ID,
        submitForReview: true,
      });
      expect(response.item).toMatchObject({ id: groupId, status: 'drafting', draftId: DRAFT_ID });
      expect(response.draft.cardIds).toEqual(['card-1']);
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: CURATOR_ID,
          action: 'KNOWLEDGE_GAP_DRAFT_REQUESTED',
          entityId: groupId,
          payload: expect.objectContaining({ draftId: DRAFT_ID, cardsAccepted: 1 }),
        }),
      );
    });

    it('aceita o tema ajustado pelo curador e não manda "outro" como síndrome', async () => {
      const groupId = await seed('dor no peito e falta de ar', 1, { syndrome: 'outro' });

      await queue.draft(CURATOR_ID, groupId, {
        topic: 'Dor torácica: escore HEART',
        submitForReview: false,
      });

      expect(drafts.draft).toHaveBeenCalledWith(
        expect.objectContaining({
          topic: 'Dor torácica: escore HEART',
          syndrome: null,
          submitForReview: false,
        }),
      );
    });

    it('rascunho sem cartão aceito deixa a lacuna aberta, com o rascunho registrado', async () => {
      drafts.draft.mockResolvedValue(draftResult([]));
      const groupId = await seed('adrenalina na anafilaxia', 1);

      const response = await queue.draft(CURATOR_ID, groupId, { submitForReview: true });

      expect(response.item).toMatchObject({ status: 'open', draftId: DRAFT_ID });
    });

    it('lacuna sem consulta pede o tema', async () => {
      await gaps.record({
        source: 'physician_not_found',
        interactionId: 'int-1',
        syndrome: 'febre',
        searchQueries: [],
      });

      await expect(
        queue.draft(CURATOR_ID, store.groups[0]!.id, { submitForReview: true }),
      ).rejects.toThrow(BadRequestException);
      expect(drafts.draft).not.toHaveBeenCalled();
    });

    it('lacuna descartada precisa ser reaberta antes; lacuna inexistente é 404', async () => {
      const groupId = await seed('atestado médico', 1);
      await queue.dismiss(CURATOR_ID, groupId, { reason: 'Administrativo' });

      await expect(queue.draft(CURATOR_ID, groupId, { submitForReview: true })).rejects.toThrow(
        ConflictException,
      );
      await expect(
        queue.draft(CURATOR_ID, '00000000-0000-4000-8000-000000000000', { submitForReview: true }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('dismiss e reopen', () => {
    it('descarta com o motivo mascarado; a trilha guarda só o hash', async () => {
      const groupId = await seed('atestado médico', 1);

      const item = await queue.dismiss(CURATOR_ID, groupId, {
        reason: 'Administrativo; pedido do CPF 529.982.247-25',
      });

      const masked = 'Administrativo; pedido do CPF [REDACTED_CPF]';
      expect(item).toMatchObject({ status: 'dismissed', dismissReason: masked });
      expect(audit.log).toHaveBeenCalledWith({
        actorId: CURATOR_ID,
        action: 'KNOWLEDGE_GAP_DISMISSED',
        entity: 'KnowledgeGapGroup',
        entityId: groupId,
        payload: { previousStatus: 'open', reasonSha256: sha256Hex(masked) },
      });
    });

    it('nova lacuna do tema descartado continua contando, sem reabrir', async () => {
      const groupId = await seed('atestado médico', 1);
      await queue.dismiss(CURATOR_ID, groupId, { reason: 'Administrativo' });
      clock = new Date(NOW.getTime() + DAY);
      vi.setSystemTime(clock);
      await seed('atestado médico', 1, { daysAgo: -1 });

      const [item] = (await queue.list({ status: 'dismissed', limit: 20, offset: 0 })).items;

      expect(item).toMatchObject({ occurrences: 2, status: 'dismissed', recurredAfterClose: true });
    });

    it('reabre a lacuna descartada e limpa o motivo; reabrir a aberta é 409', async () => {
      const groupId = await seed('atestado médico', 1);
      await queue.dismiss(CURATOR_ID, groupId, { reason: 'Administrativo' });

      const item = await queue.reopen(CURATOR_ID, groupId);

      expect(item).toMatchObject({ status: 'open', dismissReason: null });
      expect(store.groups[0]!.dismissReason).toBeNull();
      await expect(queue.reopen(CURATOR_ID, groupId)).rejects.toThrow(ConflictException);
    });

    it('descartar o que já foi coberto é 409', async () => {
      const groupId = await seed('atestado médico', 1);
      store.groups[0]!.status = 'covered';
      store.groups[0]!.coveredByCardId = 'card-1';

      await expect(
        queue.dismiss(CURATOR_ID, groupId, { reason: 'Administrativo' }),
      ).rejects.toThrow(ConflictException);
    });
  });

  it('fecha ao publicar o cartão que saiu do rascunho pedido da fila', async () => {
    const groupId = await seed('adrenalina na anafilaxia', 2, { syndrome: 'reacao-alergica' });
    await queue.draft(CURATOR_ID, groupId, { submitForReview: true });
    store.cards.push({
      id: 'card-1',
      topic: 'Anafilaxia',
      syndrome: 'reacao-alergica',
      institutionId: null,
      status: 'published',
      question: 'Qual a dose de adrenalina IM na anafilaxia?',
      draftIds: [DRAFT_ID],
    });

    await gaps.closeGroupsCoveredBy('card-1', CURATOR_ID);
    const page = await queue.list({ status: 'covered', limit: 20, offset: 0 });

    expect(page.items).toEqual([
      expect.objectContaining({
        id: groupId,
        status: 'covered',
        coveredByCard: { id: 'card-1', topic: 'Anafilaxia' },
        recurredAfterClose: false,
      }),
    ]);
    expect(page.countsByStatus).toMatchObject({ open: 0, drafting: 0, covered: 1 });
  });

  describe('weeklyReport', () => {
    it('as mais frequentes da semana, por fonte, sem as descartadas', async () => {
      const dengue = await seed('hidratação na dengue grupo C', 3, {
        syndrome: 'febre',
        daysAgo: 2,
      });
      await seed('hidratação na dengue grupo C', 1, {
        syndrome: 'febre',
        source: 'decision_no_card',
        daysAgo: 1,
      });
      const shock = await seed('noradrenalina no choque séptico', 1, {
        syndrome: 'choque',
        daysAgo: 3,
      });
      await seed('vertigem posicional manobra de Epley', 6, { syndrome: 'vertigem', daysAgo: 10 });
      const admin = await seed('atestado médico', 5, { daysAgo: 1 });
      await queue.dismiss(CURATOR_ID, admin, { reason: 'Administrativo' });

      const report = await queue.weeklyReport(REPORT_END);

      expect(report).toMatchObject({
        from: new Date(REPORT_END.getTime() - 7 * DAY).toISOString(),
        to: REPORT_END.toISOString(),
        occurrences: 10,
        bySource: { quick_question: 9, decision_no_card: 1, physician_not_found: 0 },
        newGroups: 3,
        closed: { covered: 0, dismissed: 1 },
      });
      expect(report.top.map((item) => item.id)).toEqual([dengue, shock]);
      expect(report.top[0]).toMatchObject({
        occurrencesInWeek: 4,
        occurrences: 4,
        sourcesInWeek: { quick_question: 3, decision_no_card: 1 },
        severity: 'urgent',
      });
      expect(JSON.stringify(report)).not.toContain('queries');
    });

    it('para no 10º grupo', async () => {
      const topics = [
        'adrenalina anafilaxia',
        'ceftriaxona meningite',
        'noradrenalina choque',
        'insulina cetoacidose',
        'hidratacao dengue',
        'salbutamol asma',
        'midazolam convulsao',
        'naloxona opioide',
        'trombolise avc',
        'heparina tromboembolismo',
        'amoxicilina otite',
      ];
      for (const topic of topics) await seed(topic, 1);

      expect((await queue.weeklyReport(REPORT_END)).top).toHaveLength(10);
    });
  });
});
