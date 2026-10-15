import type { PsSyndrome } from '../../shared/contracts/clinical';
import type { KnowledgeGapSeverity } from '../../shared/contracts/knowledge-gaps';

/**
 * CC-409 — gravidade de cada síndrome de PS, para a fila pôr na frente a
 * lacuna que mais custa ao paciente. Segue a ordem da CC-410: emergências
 * tempo-críticas primeiro, depois as apresentações comuns.
 *
 * PROVISÓRIA: escrita pela engenharia a partir da `timeCritical` da Etapa 1
 * (trata em minutos a uma hora) — precisa da revisão dos médicos antes de
 * guiar a escrita dos cartões. Mudar aqui só muda a ordem da fila.
 */
export const SYNDROME_SEVERITY: Record<PsSyndrome, KnowledgeGapSeverity> = {
  choque: 'time_critical',
  'febre-hipotensao': 'time_critical',
  'rebaixamento-consciencia': 'time_critical',
  'deficit-neurologico-focal': 'time_critical',
  'dor-toracica': 'time_critical',
  'crise-convulsiva': 'time_critical',
  'reacao-alergica': 'time_critical',
  intoxicacao: 'time_critical',
  dispneia: 'time_critical',
  'disturbio-glicemico': 'time_critical',
  cefaleia: 'urgent',
  'dor-abdominal': 'urgent',
  febre: 'urgent',
  'agitacao-psicomotora': 'urgent',
  'pressao-arterial-elevada': 'urgent',
  'infeccao-respiratoria': 'urgent',
  'diarreia-vomitos': 'common',
  'dor-lombar-flanco': 'common',
  'pele-partes-moles': 'common',
  'sintomas-urinarios': 'common',
  vertigem: 'common',
  outro: 'common',
};

/** Peso na prioridade: uma lacuna tempo-crítica vale três comuns. */
export const SEVERITY_WEIGHT: Record<KnowledgeGapSeverity, number> = {
  time_critical: 3,
  urgent: 2,
  common: 1,
};

/** Sem síndrome (pergunta rápida, análise sem entendimento): comum. */
export function severityOf(syndrome: PsSyndrome | null): KnowledgeGapSeverity {
  return syndrome ? SYNDROME_SEVERITY[syndrome] : 'common';
}

/** Ordem da fila: ocorrências × peso da gravidade. */
export function gapPriority(occurrences: number, severity: KnowledgeGapSeverity): number {
  return occurrences * SEVERITY_WEIGHT[severity];
}

export interface RankedGroup {
  id: string;
  priority: number;
  severity: KnowledgeGapSeverity;
  lastSeenAt: Date;
}

/**
 * Maior prioridade primeiro; empate vai para a síndrome mais grave, depois
 * para a lacuna mais recente e, por fim, para o id — a mesma fila sempre na
 * mesma ordem.
 */
export function compareByPriority(a: RankedGroup, b: RankedGroup): number {
  return (
    b.priority - a.priority ||
    SEVERITY_WEIGHT[b.severity] - SEVERITY_WEIGHT[a.severity] ||
    b.lastSeenAt.getTime() - a.lastSeenAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}
