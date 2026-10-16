import { describe, expect, it } from 'vitest';
import { appSectionsFor } from '../nav-config';

function hrefs(sections: ReturnType<typeof appSectionsFor>): string[] {
  return sections.flatMap((section) => section.items.map((item) => item.href));
}

describe('appSectionsFor', () => {
  it('mostra a fila de revisão de cartões só ao revisor (CC-404)', () => {
    expect(hrefs(appSectionsFor('physician', { isCardReviewer: true }))).toContain('/revisao');
    expect(hrefs(appSectionsFor('physician'))).not.toContain('/revisao');
    expect(hrefs(appSectionsFor('admin', { isCardReviewer: false }))).not.toContain('/revisao');
  });

  it('o revisor continua sem o console admin', () => {
    expect(hrefs(appSectionsFor('physician', { isCardReviewer: true }))).not.toContain('/admin');
  });
});
