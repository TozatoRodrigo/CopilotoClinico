import type { EvalCaseDraft } from '@/lib/types';

/**
 * CC-703 — salva o rascunho de caso do gabarito como `<id>.json`, o nome que
 * o carregador do gabarito exige (evals/clinical/cases.ts). O rascunho vem
 * pronto do servidor (GET /admin/copilot-feedback/:id/eval-case-draft): texto
 * mascarado, formato v2 e o que falta marcado "A PREENCHER".
 */
export function downloadEvalCaseDraft(draft: EvalCaseDraft): string {
  const fileName = `${draft.id}.json`;
  const blob = new Blob([`${JSON.stringify(draft, null, 2)}\n`], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
  return fileName;
}
