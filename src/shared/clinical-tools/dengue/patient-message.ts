/**
 * Mensagem de orientação de alta para o paciente (WhatsApp), CC-325.
 *
 * Sai do celular do médico para o do paciente, então não pode levar nada que
 * identifique alguém: o texto é fixo (o mesmo para qualquer paciente, como no
 * ANY) e a única coisa variável é a data e a hora em que foi emitida. A
 * entrada é só `issuedAt`, de propósito — não há como passar nome, idade,
 * endereço, peso ou qualquer dado do caso. tests/clinical-tools/dengue-patient-message.spec.ts
 * garante as duas coisas.
 */
export interface PatientMessageInput {
  /** Quando a mensagem foi gerada (relógio injetado pela tela). */
  issuedAt: Date;
}

/** Texto do ANY, em blocos; `*negrito*` e `_itálico_` são a marcação do WhatsApp. */
export const PATIENT_MESSAGE = {
  title: 'ORIENTAÇÕES DE ALTA — DENGUE',
  sections: [
    {
      title: 'Hidratação:',
      lines: [
        'Beber bastante líquido ao longo do dia (água, suco, chá, água de coco). Pelo menos 2 a 3 litros por dia, incluindo soro de reidratação oral.',
      ],
    },
    { title: 'Repouso:', lines: ['Manter repouso relativo nos primeiros dias.'] },
    {
      title: 'Medicação:',
      lines: [
        'Usar apenas paracetamol ou dipirona para febre ou dor.',
        '*NÃO usar* ibuprofeno, diclofenaco, AAS (aspirina) ou outros anti-inflamatórios.',
      ],
    },
    { title: 'Retorno:', lines: ['Conforme orientação médica para reavaliação.'] },
  ],
  warningTitle: 'PROCURE ATENDIMENTO IMEDIATO SE:',
  warningSigns: [
    'Dor abdominal forte e contínua',
    'Vômitos que não param',
    'Sangramento (gengiva, nariz, fezes ou urina escuras)',
    'Tontura ou desmaio ao levantar',
    'Pele fria, pálida ou suada',
    'Falta de ar',
    'Sonolência excessiva ou agitação',
  ],
  // ANY: "Dengue Path — ANY App — Medicina de Emergência" (marca trocada; ver revisão clínica).
  signature: ['Dengue — Copiloto Clínico', 'Ferramenta de apoio à decisão clínica'],
} as const;

const pad = (value: number): string => String(value).padStart(2, '0');

/** "15/10/2026" e "14:05", no fuso do aparelho, como o ANY. */
function issuedAtText(issuedAt: Date): { date: string; time: string } {
  return {
    date: `${pad(issuedAt.getDate())}/${pad(issuedAt.getMonth() + 1)}/${issuedAt.getFullYear()}`,
    time: `${pad(issuedAt.getHours())}:${pad(issuedAt.getMinutes())}`,
  };
}

export function buildPatientMessage({ issuedAt }: PatientMessageInput): string {
  const { date, time } = issuedAtText(issuedAt);
  const sections = PATIENT_MESSAGE.sections.map(({ title, lines }) =>
    [`*${title}*`, ...lines].join('\n'),
  );
  return [
    `*${PATIENT_MESSAGE.title}*\n_Emitido em ${date} às ${time}_`,
    ...sections,
    '---',
    [
      `*${PATIENT_MESSAGE.warningTitle}*`,
      ...PATIENT_MESSAGE.warningSigns.map((sign) => `- ${sign}`),
    ].join('\n'),
    PATIENT_MESSAGE.signature.map((line) => `_${line}_`).join('\n'),
  ].join('\n\n');
}

/** Link de compartilhamento do WhatsApp (sem destinatário: o médico escolhe na hora). */
export function whatsappShareUrl(message: string): string {
  return `https://wa.me/?text=${encodeURIComponent(message)}`;
}
