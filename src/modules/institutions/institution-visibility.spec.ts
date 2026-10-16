import { describe, expect, it } from 'vitest';
import { isVisibleToInstitutions } from './institution-visibility';

describe('isVisibleToInstitutions (CC-019, ADR-009)', () => {
  it('conteúdo global é de todos, até de quem não tem vínculo', () => {
    expect(isVisibleToInstitutions(null, [])).toBe(true);
    expect(isVisibleToInstitutions(null, ['inst-a'])).toBe(true);
  });

  it('institucional só para quem tem vínculo ativo com a instituição', () => {
    expect(isVisibleToInstitutions('inst-a', ['inst-a', 'inst-b'])).toBe(true);
    expect(isVisibleToInstitutions('inst-a', ['inst-b'])).toBe(false);
    expect(isVisibleToInstitutions('inst-a', [])).toBe(false);
  });
});
