import type { Interpretation, ResultBand, ScoreItem } from '../calculator';
import type { NumericRange } from '../ranges';

/**
 * Contas de ventilação mecânica do VM Guide do ANY (CC-327) como dado
 * tipado. A conta e o texto ficam aqui; a tela só desenha.
 */

/** Seções do VM Guide, na ordem do ANY. */
export const VENTILATION_SECTIONS = [
  { id: 'peso', label: 'Peso predito e volume corrente' },
  { id: 'mecanica', label: 'Mecânica respiratória' },
  { id: 'troca', label: 'Troca gasosa' },
  { id: 'desmame', label: 'Desmame' },
  { id: 'outros', label: 'Outros parâmetros' },
] as const;

export type VentilationSectionId = (typeof VENTILATION_SECTIONS)[number]['id'];

/**
 * Aviso de faixa habitual do ANY: o campo fica marcado, mas a conta roda.
 * Fora da faixa aceita (`min`/`max` do campo) é diferente: erro, sem conta.
 */
export interface UsualRange {
  /** O ANY avisava abaixo deste valor (o próprio valor não avisa). */
  min: number;
  /** O ANY avisava acima deste valor (o próprio valor não avisa). */
  max: number;
  message: string;
}

export interface VentilationInput extends NumericRange {
  id: string;
  label: string;
  /** Passo do valor digitado; só orienta o teclado e o gerador de teste. */
  step: number;
  /** Exemplo do ANY ("Ex: 30"), sem o "Ex:". */
  placeholder: string;
  usual?: UsualRange;
}

/**
 * Regra entre campos que o campo sozinho não vê (platô abaixo da PEEP).
 * No ANY a conta rodava e dava número sem sentido; aqui a conta não roda.
 */
export interface CrossCheck {
  id: string;
  /** Campos que o médico precisa corrigir. */
  fields: readonly string[];
  message: string;
  holds: (values: Readonly<Record<string, number>>) => boolean;
}

/** Linha principal do resultado ("Rva: 16,7 cmH₂O/L/s"). */
export interface VentilationReading {
  /** Nome curto do resultado; vazio quando o texto já diz tudo ("SpO₂ > 97%"). */
  label: string;
  /** Valor formatado com vírgula, ou o texto que o substitui. */
  text: string;
  /** Unidade ao lado do valor; vazia quando não há. */
  unit: string;
}

export interface VentilationOutcome {
  /** Conta sem arredondar; `null` quando ela não se aplica (S/F com SpO₂ > 97%). */
  value: number | null;
  reading: VentilationReading;
  /** Linhas abaixo do valor, na ordem do ANY ("VC 6 mL/kg: 420 mL"). */
  details: readonly string[];
  /** Faixa lida sobre o valor sem arredondar; `null` = só informativo. */
  band: ResultBand | null;
}

export interface VentilationNote {
  title: string;
  items: readonly string[];
}

/** Atalho para outra ferramenta quando a faixa pede (ROX baixo → via aérea). */
export interface RelatedTool {
  toolId: string;
  label: string;
  /** Faixas em que o atalho aparece. */
  bandIds: readonly string[];
}

export interface VentilationCalculation {
  id: string;
  name: string;
  section: VentilationSectionId;
  /** Sinônimos para a busca. */
  aliases: readonly string[];
  /** Texto de conceito do ANY, mostrado acima dos campos. */
  concept: string;
  /** Escolhas antes dos campos (sexo do peso predito). Pontos não se aplicam. */
  choices?: readonly ScoreItem[];
  inputs: readonly VentilationInput[];
  checks?: readonly CrossCheck[];
  interpretation?: Interpretation;
  /** Caixa fixa abaixo da conta (Tobin: outros parâmetros de desmame). */
  note?: VentilationNote;
  related?: RelatedTool;
  /** Referência da lista do VM Guide que fundamenta a conta, quando há. */
  citation?: string;
  /**
   * Recebe só valores já validados (na faixa e nas regras entre campos) e o
   * id da opção de cada escolha. Mesma aritmética e mesma ordem de operações
   * do ANY: o teste diferencial compara sem tolerância.
   */
  compute: (
    values: Readonly<Record<string, number>>,
    choices: Readonly<Record<string, string>>,
  ) => VentilationOutcome;
}
