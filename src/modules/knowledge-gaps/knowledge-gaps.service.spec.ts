import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditService } from '../audit/audit.service';
import { createGapStore } from '../../../tests/fixtures/knowledge-gaps';
import { KNOWLEDGE_GAP_RETENTION_DAYS, KnowledgeGapsService } from './knowledge-gaps.service';

const NOW = new Date('2026-10-15T12:00:00.000Z');
const CURATOR_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

/**
 * CC-409 — registro único de lacunas: as três fontes na mesma tabela, no
 * mesmo grupo quando falam do mesmo tema, e o grupo fecha quando um cartão
 * publicado o cobre.
 */
describe('KnowledgeGapsService', () => {
  let store: ReturnType<typeof createGapStore>;
  let audit: { log: ReturnType<typeof vi.fn> };
  let service: KnowledgeGapsService;
  let clock: Date;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    clock = NOW;
    store = createGapStore(() => clock);
    audit = { log: vi.fn().mockResolvedValue({}) };
    service = new KnowledgeGapsService(store.prisma, audit as unknown as AuditService);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('record — as três fontes numa tabela só', () => {
    it('análise, decisão e pergunta rápida sobre o mesmo tema caem no mesmo grupo', async () => {
      store.linkInteraction('int-1', 'enc-1');
      store.linkInteraction('int-2', 'enc-2');
      const notFound = await service.record({
        source: 'physician_not_found',
        interactionId: 'int-1',
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme', 'hidratação dengue grupo C'],
        note: 'Faltou a hidratação por peso',
      });
      const decision = await service.record({
        source: 'decision_no_card',
        interactionId: 'int-2',
        syndrome: 'febre',
        searchQueries: ['hidratação venosa na dengue com sinais de alarme'],
        dedupeEncounterId: 'enc-2',
      });
      const quick = await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['quanto de soro na dengue grupo C?'],
      });

      expect(notFound).toMatchObject({ recorded: true, newGroup: true });
      expect(decision).toMatchObject({
        recorded: true,
        newGroup: false,
        groupId: notFound.groupId,
      });
      expect(quick).toMatchObject({ recorded: true, newGroup: false, groupId: notFound.groupId });
      expect(store.gaps.map((gap) => gap.source)).toEqual([
        'physician_not_found',
        'decision_no_card',
        'quick_question',
      ]);
      expect(store.groups).toHaveLength(1);
      expect(store.groups[0]).toMatchObject({
        syndrome: 'febre',
        topic: 'dengue sinais de alarme',
        status: 'open',
      });
    });

    it('temas diferentes abrem grupos diferentes', async () => {
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['dose de ceftriaxona na meningite'],
      });
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['adrenalina na anafilaxia'],
      });

      expect(store.groups).toHaveLength(2);
    });

    it('grava só síndrome, consultas e nota: nenhum campo de médico, atendimento ou instituição', async () => {
      store.linkInteraction('int-1', 'enc-1');
      await service.record({
        source: 'decision_no_card',
        interactionId: 'int-1',
        syndrome: 'febre',
        searchQueries: ['  dengue sinais de alarme  ', ''],
        dedupeEncounterId: 'enc-1',
      });

      expect(Object.keys(store.gaps[0]!).sort()).toEqual(
        [
          'createdAt',
          'groupId',
          'id',
          'interactionId',
          'note',
          'searchQueries',
          'source',
          'syndrome',
          'updatedAt',
        ].sort(),
      );
      expect(store.gaps[0]!.searchQueries).toEqual(['dengue sinais de alarme']);
    });

    it('o segundo toque na mesma análise atualiza a nota em vez de contar de novo', async () => {
      const input = {
        source: 'physician_not_found' as const,
        interactionId: 'int-1',
        syndrome: 'febre' as const,
        searchQueries: ['dengue sinais de alarme'],
      };
      await service.record({ ...input, note: 'Faltou a hidratação' });
      await service.record(input);
      await service.record({ ...input, note: 'Faltou a hidratação por peso' });

      expect(store.gaps).toHaveLength(1);
      expect(store.gaps[0]!.note).toBe('Faltou a hidratação por peso');
    });

    it('a reanálise do mesmo atendimento não conta de novo a lacuna da decisão', async () => {
      store.linkInteraction('int-1', 'enc-1');
      store.linkInteraction('int-2', 'enc-1');
      const input = {
        source: 'decision_no_card' as const,
        syndrome: 'febre' as const,
        searchQueries: ['dengue sinais de alarme'],
        dedupeEncounterId: 'enc-1',
      };
      await service.record({ ...input, interactionId: 'int-1' });
      const again = await service.record({ ...input, interactionId: 'int-2' });

      expect(again).toMatchObject({ recorded: false, gapId: null });
      expect(store.gaps).toHaveLength(1);
    });

    it('o grupo sem síndrome adota a primeira síndrome definida que chega', async () => {
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['adrenalina na anafilaxia'],
      });
      await service.record({
        source: 'decision_no_card',
        interactionId: 'int-1',
        syndrome: 'reacao-alergica',
        searchQueries: ['anafilaxia adrenalina intramuscular'],
      });

      expect(store.groups).toHaveLength(1);
      expect(store.groups[0]!.syndrome).toBe('reacao-alergica');
    });

    it('agrupa dentro de uma transação com trava, para dois pedidos iguais não abrirem dois grupos', async () => {
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['adrenalina na anafilaxia'],
      });

      expect(store.locks).toHaveLength(1);
    });
  });

  describe('closeGroupsCoveredBy — fechar ao publicar cartão', () => {
    async function openGroup(queries: string[], syndrome: 'febre' | null = 'febre') {
      const result = await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome,
        searchQueries: queries,
      });
      return result.groupId;
    }

    it('fecha o grupo em que o tema e a pergunta do cartão global cairiam, com a trilha', async () => {
      const meningitis = await openGroup(['ceftriaxona na meningite bacteriana']);
      const dengue = await openGroup(['hidratação na dengue']);
      store.cards.push({
        id: 'card-1',
        topic: 'Meningite bacteriana',
        syndrome: 'febre',
        institutionId: null,
        status: 'published',
        question: 'Qual o antibiótico empírico na meningite bacteriana? Ceftriaxona.',
        draftIds: [],
      });

      await expect(service.closeGroupsCoveredBy('card-1', CURATOR_ID)).resolves.toBe(1);

      expect(store.groups.find((group) => group.id === meningitis)).toMatchObject({
        status: 'covered',
        coveredByCardId: 'card-1',
        statusChangedAt: NOW,
      });
      expect(store.groups.find((group) => group.id === dengue)!.status).toBe('open');
      expect(audit.log).toHaveBeenCalledWith({
        actorId: CURATOR_ID,
        action: 'KNOWLEDGE_GAP_COVERED',
        entity: 'KnowledgeGapGroup',
        entityId: meningitis,
        payload: { cardId: 'card-1', previousStatus: 'open', byDraft: false },
      });
    });

    it('fecha pelo rascunho pedido da fila, mesmo com tema diferente ou cartão de instituição', async () => {
      const groupId = await openGroup(['Dengue: quando internar'], null);
      store.groups[0]!.status = 'drafting';
      store.groups[0]!.draftId = 'draft-1';
      store.cards.push({
        id: 'card-1',
        topic: 'Critérios de internação',
        syndrome: 'febre',
        institutionId: 'inst-1',
        status: 'published',
        question: 'Quando internar?',
        draftIds: ['draft-1'],
      });

      await service.closeGroupsCoveredBy('card-1', CURATOR_ID);

      expect(store.groups.find((group) => group.id === groupId)).toMatchObject({
        status: 'covered',
        coveredByCardId: 'card-1',
      });
    });

    it('cartão de instituição não fecha por semelhança: a lacuna não diz a instituição', async () => {
      await openGroup(['ceftriaxona na meningite bacteriana']);
      store.cards.push({
        id: 'card-1',
        topic: 'Meningite bacteriana',
        syndrome: 'febre',
        institutionId: 'inst-1',
        status: 'published',
        question: 'Ceftriaxona na meningite bacteriana',
        draftIds: [],
      });

      await expect(service.closeGroupsCoveredBy('card-1', CURATOR_ID)).resolves.toBe(0);
      expect(store.groups[0]!.status).toBe('open');
    });

    it('não reabre nem refecha grupo descartado ou já coberto', async () => {
      await openGroup(['ceftriaxona na meningite bacteriana']);
      store.groups[0]!.status = 'dismissed';
      store.groups[0]!.dismissReason = 'fora do escopo do PS';
      store.cards.push({
        id: 'card-1',
        topic: 'Meningite bacteriana',
        syndrome: 'febre',
        institutionId: null,
        status: 'published',
        question: 'Ceftriaxona na meningite bacteriana',
        draftIds: [],
      });

      await expect(service.closeGroupsCoveredBy('card-1', CURATOR_ID)).resolves.toBe(0);
      expect(store.groups[0]!.status).toBe('dismissed');
    });

    it('cartão que não está publicado não fecha nada', async () => {
      await openGroup(['ceftriaxona na meningite bacteriana']);
      store.cards.push({
        id: 'card-1',
        topic: 'Meningite bacteriana',
        syndrome: 'febre',
        institutionId: null,
        status: 'in_review',
        question: 'Ceftriaxona na meningite bacteriana',
        draftIds: [],
      });

      await expect(service.closeGroupsCoveredBy('card-1', CURATOR_ID)).resolves.toBe(0);
    });
  });

  describe('maintain — varredura diária', () => {
    it('apaga lacunas além da retenção e o grupo aberto que ficou vazio, e mantém o fechado', async () => {
      clock = new Date(NOW.getTime() - (KNOWLEDGE_GAP_RETENTION_DAYS + 1) * 86_400_000);
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['adrenalina na anafilaxia'],
      });
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['ceftriaxona na meningite'],
      });
      store.groups[1]!.status = 'dismissed';
      store.groups[1]!.dismissReason = 'já existe cartão';
      clock = NOW;
      await service.record({
        source: 'quick_question',
        interactionId: null,
        syndrome: null,
        searchQueries: ['hidratação na dengue'],
      });

      const result = await service.maintain(NOW);

      expect(result).toEqual({ purged: 2, grouped: 0, emptyGroupsRemoved: 1 });
      expect(store.gaps).toHaveLength(1);
      expect(store.groups.map((group) => group.status).sort()).toEqual(['dismissed', 'open']);
    });

    it('agrupa as lacunas gravadas antes da CC-409', async () => {
      store.gaps.push({
        id: 'legacy-1',
        source: 'physician_not_found',
        interactionId: 'int-legacy',
        syndrome: 'febre',
        searchQueries: ['dengue sinais de alarme'],
        note: null,
        groupId: null,
        createdAt: NOW,
        updatedAt: NOW,
      });

      const result = await service.maintain(NOW);

      expect(result.grouped).toBe(1);
      expect(store.gaps[0]!.groupId).toBe(store.groups[0]!.id);
    });
  });
});
