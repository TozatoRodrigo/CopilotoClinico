import type { CopilotFeedbackTriageItem } from '@/lib/types';

/**
 * F0-D — esqueleto de caso do gabarito de avaliação a partir de um reporte de
 * campo. A curadoria completa `title`, `tags` e `expected` à mão; o que vem do
 * sistema é só o texto do caso (já com PII mascarada) e a origem.
 */
export interface GoldCaseSkeleton {
  id: string;
  title: string;
  tags: string[];
  critical: boolean;
  goldSource: 'field_incident';
  review: { status: 'draft' };
  input: { caseText: string };
  expected: {
    syndrome: string;
    cannotMiss: string[];
    mustRequest: string[];
    requiredActions: string[];
    forbiddenDefinitiveActions: string[];
    expectedPath: 'any';
  };
}

/** `campo-` + 8 primeiros caracteres do id do reporte: rastreável de volta à fila. */
const GOLD_CASE_ID_CHARS = 8;

export function buildGoldCaseSkeleton(item: CopilotFeedbackTriageItem): GoldCaseSkeleton {
  return {
    id: `campo-${item.id.slice(0, GOLD_CASE_ID_CHARS)}`,
    title: '',
    tags: [],
    critical: false,
    goldSource: 'field_incident',
    review: { status: 'draft' },
    input: { caseText: item.interaction.inputRedacted ?? '' },
    expected: {
      syndrome: '',
      cannotMiss: [],
      mustRequest: [],
      requiredActions: [],
      forbiddenDefinitiveActions: [],
      expectedPath: 'any',
    },
  };
}

/**
 * Copia texto para a área de transferência. Precisa ser chamada DENTRO do
 * handler de clique (gesto do usuário), antes de qualquer `await` que não
 * seja a própria escrita: Safari e Firefox recusam a Clipboard API fora
 * disso. Sem Clipboard API (HTTP, navegador antigo, permissão negada), cai
 * no `execCommand('copy')` com um textarea temporário.
 */
export async function copyText(text: string): Promise<boolean> {
  // Sem Clipboard API, o fallback roda síncrono, ainda dentro do gesto.
  if (!navigator.clipboard?.writeText) return copyWithTextarea(text);
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return copyWithTextarea(text);
  }
}

function copyWithTextarea(text: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    textarea.remove();
  }
}
