import { createHash } from 'node:crypto';
import type { LegalDocumentSection } from '../../shared/contracts/legal';

/**
 * CC-905 — sha256 (hex) do texto de um documento legal: título e seções.
 *
 * O JSON é montado aqui com as chaves numa ordem fixa, não serializado do
 * objeto recebido: o mesmo texto dá o mesmo hash venha do catálogo ou do
 * `sections` lido do banco. Tipo e versão ficam de fora de propósito: duas
 * versões com o mesmo hash têm o mesmo texto.
 */
export function legalDocumentHash(document: {
  title: string;
  sections: readonly LegalDocumentSection[];
}): string {
  const canonical = JSON.stringify({
    title: document.title,
    sections: document.sections.map((section) => ({
      heading: section.heading,
      paragraphs: [...section.paragraphs],
    })),
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}
