import { describe, expect, it } from 'vitest';
import type { KnowledgeCardStatus } from '../../../shared/contracts/knowledge-cards';
import {
  KNOWLEDGE_CARD_ACTIONS,
  displayStatus,
  transition,
  validUntilFrom,
  type KnowledgeCardAction,
} from './card-lifecycle';

const STATUSES: KnowledgeCardStatus[] = ['draft', 'in_review', 'published', 'archived'];

describe('transition', () => {
  it.each<[KnowledgeCardStatus, KnowledgeCardAction, boolean, KnowledgeCardStatus]>([
    ['draft', 'submit', false, 'in_review'],
    ['in_review', 'approve', false, 'published'],
    ['in_review', 'approve', true, 'published'],
    ['in_review', 'reject', false, 'archived'],
    // Correção recusada de cartão publicado: a versão assinada segue valendo.
    ['in_review', 'reject', true, 'published'],
    ['draft', 'archive', false, 'archived'],
    ['in_review', 'archive', false, 'archived'],
    ['published', 'archive', true, 'archived'],
    ['draft', 'edit', false, 'draft'],
    ['in_review', 'edit', false, 'in_review'],
    // Corrigir o publicado abre revisão da versão nova.
    ['published', 'edit', true, 'in_review'],
    // CC-411 — a revisão cruzada divergiu: o cartão sai do ar e volta à fila.
    ['published', 'reopen', true, 'in_review'],
  ])('%s --%s--> (publicado antes: %s) %s', (status, action, hasPublishedVersion, to) => {
    expect(transition({ status, hasPublishedVersion }, action)).toEqual({ ok: true, to });
  });

  it.each<[KnowledgeCardStatus, KnowledgeCardAction]>([
    ['in_review', 'submit'],
    ['published', 'submit'],
    ['draft', 'approve'],
    ['published', 'approve'],
    ['draft', 'reject'],
    ['published', 'reject'],
    ['draft', 'reopen'],
    ['in_review', 'reopen'],
  ])('recusa %s --%s-->', (status, action) => {
    const result = transition({ status, hasPublishedVersion: status === 'published' }, action);
    expect(result.ok).toBe(false);
  });

  it('não deixa nada sair de arquivado', () => {
    for (const action of KNOWLEDGE_CARD_ACTIONS) {
      expect(transition({ status: 'archived', hasPublishedVersion: true }, action).ok).toBe(false);
    }
  });

  it('explica a recusa em português', () => {
    expect(transition({ status: 'draft', hasPublishedVersion: false }, 'approve')).toEqual({
      ok: false,
      reason: 'não é possível aprovar um cartão rascunho',
    });
  });

  it('só aprova o que está em revisão', () => {
    const approvable = STATUSES.filter(
      (status) => transition({ status, hasPublishedVersion: false }, 'approve').ok,
    );
    expect(approvable).toEqual(['in_review']);
  });
});

describe('validUntilFrom', () => {
  it('soma os meses no calendário UTC', () => {
    expect(validUntilFrom(new Date('2026-10-14T13:00:00Z'), 12).toISOString()).toBe(
      '2027-10-14T13:00:00.000Z',
    );
  });

  it('cai no último dia do mês quando o dia não existe no destino', () => {
    expect(validUntilFrom(new Date('2027-01-31T10:00:00Z'), 1).toISOString()).toBe(
      '2027-02-28T10:00:00.000Z',
    );
    expect(validUntilFrom(new Date('2027-08-31T10:00:00Z'), 6).toISOString()).toBe(
      '2028-02-29T10:00:00.000Z',
    );
  });
});

describe('displayStatus (CC-402, critério 3)', () => {
  const now = new Date('2026-10-14T12:00:00Z');

  it('mostra "revisar" para o publicado com validade vencida', () => {
    expect(
      displayStatus(
        { status: 'published', publishedValidUntil: new Date('2026-10-13T12:00:00Z') },
        now,
      ),
    ).toBe('needs_review');
  });

  it('mantém publicado dentro da validade', () => {
    expect(
      displayStatus(
        { status: 'published', publishedValidUntil: new Date('2026-10-15T12:00:00Z') },
        now,
      ),
    ).toBe('published');
  });

  it('não mexe nos outros status, mesmo com validade vencida', () => {
    const expired = new Date('2025-01-01T00:00:00Z');
    for (const status of ['draft', 'in_review', 'archived'] as const) {
      expect(displayStatus({ status, publishedValidUntil: expired }, now)).toBe(status);
    }
  });
});
