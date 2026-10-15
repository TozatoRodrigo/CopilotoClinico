/**
 * Roteiro de OVACE (obstrução de via aérea por corpo estranho) do ANY
 * (CC-314), como dado: cada passo tem blocos de texto e as opções que levam
 * ao próximo. A tela só desenha o passo em que está.
 *
 * Mesmo conteúdo do ANY, com imperativo trocado por infinitivo (ADR-017);
 * a lista do que mudou está em docs/ferramentas/revisao-clinica/acls.md.
 */

export const OVACE_STEP_IDS = [
  'assessment',
  'mild',
  'severe',
  'conscious',
  'unconscious',
  'expelled',
] as const;
export type OvaceStepId = (typeof OVACE_STEP_IDS)[number];

/**
 * Tom do bloco, sem cor (a tela escolhe): `attention` e `critical` como nas
 * calculadoras, `neutral` para o que acalma e `info` para orientação.
 */
export type OvaceTone = 'neutral' | 'attention' | 'critical' | 'info';

export interface OvaceBlock {
  tone: OvaceTone;
  /** Rótulo pequeno acima do título ("OVACE grave"). */
  label?: string;
  title: string;
  text?: string;
}

export type OvaceTarget =
  | { kind: 'step'; step: OvaceStepId }
  /** Inicia o código de PCR no ACLS. */
  | { kind: 'start-code' }
  /** Volta ao início do ACLS. */
  | { kind: 'exit' };

export interface OvaceOption {
  label: string;
  target: OvaceTarget;
  /** `primary` é a resposta principal do passo; `secondary`, voltar ou alternativa. */
  emphasis: 'primary' | 'secondary';
}

export interface OvaceStep {
  id: OvaceStepId;
  blocks: readonly OvaceBlock[];
  /** Sinais listados abaixo da pergunta (só na avaliação). */
  signs?: readonly string[];
  /** Observação em letra menor depois dos blocos. */
  note?: string;
  options: readonly OvaceOption[];
}

export const OVACE_TITLE = 'OVACE';
export const OVACE_SUBTITLE = 'Obstrução de via aérea por corpo estranho (AHA 2025)';

/** Sinais de OVACE grave do ANY (`OVACE_SIGNS`). */
export const OVACE_SIGNS: readonly string[] = [
  'Tosse fraca ou ausente',
  'Incapaz de falar ou chorar',
  'Cianose',
  'Alteração do estado mental',
  'Apneia',
];

const step = (target: OvaceStepId): OvaceTarget => ({ kind: 'step', step: target });

export const OVACE_STEPS: Readonly<Record<OvaceStepId, OvaceStep>> = {
  assessment: {
    id: 'assessment',
    blocks: [
      {
        tone: 'attention',
        label: 'Avaliação',
        title: 'O paciente apresenta sinais de OVACE grave?',
      },
    ],
    signs: OVACE_SIGNS,
    options: [
      { label: 'Sim — OVACE grave', target: step('severe'), emphasis: 'primary' },
      { label: 'Não — OVACE leve', target: step('mild'), emphasis: 'secondary' },
    ],
  },
  mild: {
    id: 'mild',
    blocks: [
      {
        tone: 'neutral',
        label: 'OVACE leve',
        title: 'Incentivar a tosse',
        text: 'Continuar monitorando sinais de agravamento. Não interferir enquanto a tosse for efetiva.',
      },
    ],
    options: [{ label: 'Voltar', target: step('assessment'), emphasis: 'secondary' }],
  },
  severe: {
    id: 'severe',
    blocks: [{ tone: 'critical', label: 'OVACE grave', title: 'O paciente está consciente?' }],
    options: [
      { label: 'Sim — Consciente', target: step('conscious'), emphasis: 'primary' },
      { label: 'Não — Inconsciente', target: step('unconscious'), emphasis: 'primary' },
    ],
  },
  conscious: {
    id: 'conscious',
    blocks: [
      {
        tone: 'critical',
        title: 'Ciclos repetidos',
        text: '5 tapas nas costas (golpes) seguidos de 5 compressões abdominais',
      },
      {
        tone: 'info',
        title: 'Repetir até que o objeto seja expelido ou o paciente fique inconsciente',
      },
    ],
    note: 'Gestante ou obeso: substituir compressões abdominais por compressões torácicas.',
    options: [
      { label: 'Objeto expelido', target: step('expelled'), emphasis: 'primary' },
      { label: 'Ficou inconsciente', target: step('unconscious'), emphasis: 'primary' },
      { label: 'Voltar ao início', target: step('assessment'), emphasis: 'secondary' },
    ],
  },
  unconscious: {
    id: 'unconscious',
    blocks: [
      {
        tone: 'critical',
        title: 'Iniciar RCP',
        text: 'Iniciar compressões torácicas. Antes de cada ventilação, verificar se há objeto visível na boca.',
      },
      { tone: 'attention', title: 'Acionar o serviço médico de emergência' },
    ],
    options: [
      { label: 'Iniciar código de PCR', target: { kind: 'start-code' }, emphasis: 'primary' },
      { label: 'Voltar ao início', target: step('assessment'), emphasis: 'secondary' },
    ],
  },
  expelled: {
    id: 'expelled',
    blocks: [
      {
        tone: 'neutral',
        label: 'Objeto expelido',
        title: 'Continuar monitorando o paciente',
        text: 'Manter observação até a chegada do serviço médico de emergência.',
      },
    ],
    options: [{ label: 'Voltar ao início', target: { kind: 'exit' }, emphasis: 'secondary' }],
  },
};
