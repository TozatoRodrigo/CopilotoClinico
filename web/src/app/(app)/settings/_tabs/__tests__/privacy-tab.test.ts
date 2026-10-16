import { describe, expect, it } from 'vitest';
import { consentNote, type ConsentScopeStatus } from '../privacy-tab';

function status(overrides: Partial<ConsentScopeStatus>): ConsentScopeStatus {
  return { scope: 'ai_processing', granted: false, grantedAt: null, revokedAt: null, ...overrides };
}

// CC-010 — "Revogado" só para quem revogou: o processamento por IA sem
// registro está ativo (padrão do servidor), e os outros escopos sem registro
// nunca foram concedidos.
describe('consentNote', () => {
  it('mostra a data da concessão registrada', () => {
    expect(consentNote(status({ granted: true, grantedAt: '2026-10-01T12:00:00.000Z' }))).toBe(
      'Concedido em 01 de outubro de 2026',
    );
  });

  it('diz que o processamento por IA sem registro vale desde o cadastro', () => {
    expect(consentNote(status({ granted: true }))).toBe('Ativo por padrão desde o cadastro.');
  });

  it('mostra a data da revogação, não a da concessão', () => {
    expect(
      consentNote(
        status({ grantedAt: '2026-06-01T12:00:00.000Z', revokedAt: '2026-10-14T12:00:00.000Z' }),
      ),
    ).toBe('Revogado em 14 de outubro de 2026');
  });

  it('não inventa data para escopo nunca concedido', () => {
    expect(consentNote(status({ scope: 'analytics' }))).toBeNull();
  });
});
