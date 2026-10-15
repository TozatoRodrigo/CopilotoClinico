import type { ResultTone } from '../tone';
import { toxChartSourceLine } from './provenance';

/**
 * Critérios de destino (CC-323): os 17 critérios do ToxPath do ANY (13 de
 * UTI e 4 de enfermaria). Qualquer critério de UTI leva à UTI; sem eles,
 * qualquer um de enfermaria leva à enfermaria; sem nenhum, observação ou
 * possível alta. O ANY chamava a tela de "Critérios de disposição".
 */

export type DispositionLevel = 'uti' | 'enfermaria';

export interface DispositionCriterion {
  id: string;
  text: string;
  detail: string;
  example: string;
  level: DispositionLevel;
}

export const DISPOSITION_CRITERIA: readonly DispositionCriterion[] = [
  {
    id: 'coma',
    text: 'Rebaixamento de consciência / Coma',
    detail: 'Paciente não responsivo a estímulos verbais ou com Glasgow <= 8',
    example: 'Letargia significativa, estupor, coma profundo',
    level: 'uti',
  },
  {
    id: 'via-aerea',
    text: 'Necessidade de IOT / Via aérea avançada',
    detail: 'Intubação orotraqueal de emergência realizada ou indicada',
    example: 'Falha em proteger via aérea, apneia, Glasgow <= 8',
    level: 'uti',
  },
  {
    id: 'depressao-respiratoria',
    text: 'Depressão respiratória (PaCO2 > 45 mmHg)',
    detail: 'Hipoventilação com retenção de CO2 ou FR < 10 irpm',
    example: 'Bradipneia por opioides, insuficiência respiratória',
    level: 'uti',
  },
  {
    id: 'hipotensao',
    text: 'Hipotensão (PAS <= 80 mmHg)',
    detail: 'Pressão arterial sistólica <= 80 mmHg ou choque',
    example: 'Choque distributivo, vasoplegia por intoxicação',
    level: 'uti',
  },
  {
    id: 'convulsoes',
    text: 'Convulsões prolongadas ou recorrentes',
    detail: 'Crise convulsiva pós-ingestão ou status epilepticus',
    example: 'Convulsões por ADT, isoniazida, cocaína',
    level: 'uti',
  },
  {
    id: 'arritmia',
    text: 'Arritmia não sinusal',
    detail: 'Ritmo diferente de sinusal ao monitor ou ECG',
    example: 'TV, FV, FA, flutter, ritmos idioventriculares',
    level: 'uti',
  },
  {
    id: 'bav',
    text: 'BAV 2º ou 3º grau',
    detail: 'Bloqueio atrioventricular de segundo ou terceiro grau',
    example: 'Intoxicação por betabloqueadores, BCC, digoxina',
    level: 'uti',
  },
  {
    id: 'qrs-qtc',
    text: 'QRS > 120 ms ou QTc > 500 ms',
    detail: 'Alargamento de QRS ou prolongamento de QT significativos',
    example: 'ADT, antiarrítmicos, antipsicóticos',
    level: 'uti',
  },
  {
    id: 'acidose',
    text: 'Acidose grave (pH <= 7,2)',
    detail: 'Acidose metabólica ou mista com pH arterial <= 7,2',
    example: 'Metanol, etilenoglicol, salicilatos, metformina',
    level: 'uti',
  },
  {
    id: 'hipertermia',
    text: 'Hipertermia grave (T > 40 °C)',
    detail: 'Temperatura central > 40 °C (104 °F)',
    example: 'Síndrome serotoninérgica, SNM, simpaticomiméticos',
    level: 'uti',
  },
  {
    id: 'hemodialise',
    text: 'Necessidade de hemodiálise',
    detail: 'Indicação de terapia extracorpórea para remoção do tóxico',
    example: 'Metanol, etilenoglicol, lítio, salicilatos graves',
    level: 'uti',
  },
  {
    id: 'agitacao',
    text: 'Agitação requerendo contenção química/física',
    detail: 'Agitação psicomotora grave não controlada com medidas simples',
    example: 'Delirium por anticolinérgicos, simpaticomiméticos',
    level: 'uti',
  },
  {
    id: 'bomba-relogio',
    text: 'Ingestão de "bomba-relógio tóxica"',
    detail: 'Substâncias com toxicidade tardia potencialmente grave',
    example: 'Paracetamol, paraquat, colchicina, metanol, etilenoglicol, cogumelos Amanita, IMAO',
    level: 'uti',
  },
  {
    id: 'toxicidade-persistente',
    text: 'Toxicidade leve a moderada persistente',
    detail: 'Sintomas que não resolvem no período de observação',
    example: 'Sonolência persistente, náuseas/vômitos, taquicardia leve',
    level: 'enfermaria',
  },
  {
    id: 'antidoto-continuo',
    text: 'Necessidade de antídoto em infusão contínua',
    detail: 'Tratamento com antídoto por tempo prolongado sem instabilidade',
    example: 'N-acetilcisteína para paracetamol (21h de infusão)',
    level: 'enfermaria',
  },
  {
    id: 'avaliacao-psiquiatrica',
    text: 'Ingestão intencional com necessidade de avaliação psiquiátrica',
    detail: 'Tentativa de autoextermínio necessitando avaliação especializada',
    example:
      'Todos os pacientes com ingestão intencional devem ter avaliação psiquiátrica antes da alta',
    level: 'enfermaria',
  },
  {
    id: 'laboratorio',
    text: 'Alterações laboratoriais que requerem monitorização',
    detail: 'Distúrbios hidroeletrolíticos, elevação de transaminases, etc.',
    example: 'Hipocalemia por teofilina, hepatotoxicidade por paracetamol',
    level: 'enfermaria',
  },
];

export const DISPOSITION_GROUPS: readonly {
  level: DispositionLevel;
  title: string;
  description: string;
}[] = [
  {
    level: 'uti',
    title: 'Critérios para UTI',
    description: 'Qualquer um destes indica necessidade de terapia intensiva',
  },
  {
    level: 'enfermaria',
    title: 'Critérios para enfermaria',
    description: 'Toxicidade moderada ou necessidade de monitorização',
  },
];

export type DispositionId = 'uti' | 'enfermaria' | 'observacao';

export interface DispositionContent {
  id: DispositionId;
  /** O ANY mostrava "CONSIDERE UTI", "CONSIDERE ENFERMARIA", "CONSIDERE OBSERVAÇÃO / POSSÍVEL ALTA". */
  label: string;
  /** UTI em vermelho, enfermaria em amarelo, observação em verde no ANY. */
  tone: ResultTone;
}

export const DISPOSITIONS: Readonly<Record<DispositionId, DispositionContent>> = {
  uti: { id: 'uti', label: 'Considere UTI', tone: 'critical' },
  enfermaria: { id: 'enfermaria', label: 'Considere enfermaria', tone: 'attention' },
  observacao: { id: 'observacao', label: 'Considere observação / possível alta', tone: 'neutral' },
};

/** Avisos fixos da tela, na ordem do ANY. */
export const DISPOSITION_INTRO =
  'Marque todos os critérios que o paciente apresenta. A recomendação de destino será atualizada automaticamente.';

export const DISPOSITION_NOTES = {
  observation: {
    title: 'Observação no DE (4-6 horas)',
    text: 'Se nenhum critério acima estiver presente, considere observação na emergência por 4-6 horas antes da alta, especialmente se: ingestão recente, formulações de liberação prolongada, ingestão intencional, história não confiável.',
  },
  discharge: {
    title: 'Critérios que podem favorecer alta',
    text: 'Assintomático após observação, sinais vitais estáveis, ECG sem alterações, exames normais, avaliação psiquiátrica realizada (se ingestão intencional).',
  },
  delayedToxicity: {
    title: 'Lembrete importante',
    text: 'Considere verificar se não há ingestão de substância com toxicidade tardia',
  },
} as const;

export interface DispositionAssessment {
  disposition: DispositionContent;
  /** Critérios marcados, na ordem da lista. */
  checked: readonly DispositionCriterion[];
  uti: number;
  enfermaria: number;
}

/** Destino pelos critérios marcados (ids fora da lista são ignorados). */
export function assessDisposition(checkedIds: Iterable<string>): DispositionAssessment {
  const ids = new Set(checkedIds);
  const checked = DISPOSITION_CRITERIA.filter(({ id }) => ids.has(id));
  const uti = checked.filter(({ level }) => level === 'uti').length;
  const enfermaria = checked.length - uti;
  const id: DispositionId = uti > 0 ? 'uti' : enfermaria > 0 ? 'enfermaria' : 'observacao';
  return { disposition: DISPOSITIONS[id], checked, uti, enfermaria };
}

/** "1 critério marcado", "3 critérios marcados". */
export function checkedCountLabel(count: number): string {
  return count === 1 ? '1 critério marcado' : `${count} critérios marcados`;
}

export function buildDispositionChartNote(assessment: DispositionAssessment): string {
  const { disposition, checked } = assessment;
  return [
    `Intoxicação — critérios de destino: ${disposition.label} (${checkedCountLabel(checked.length)}).`,
    ...checked.map(({ text, level }) => `- ${text} (${level === 'uti' ? 'UTI' : 'enfermaria'})`),
    toxChartSourceLine(),
  ].join('\n');
}
