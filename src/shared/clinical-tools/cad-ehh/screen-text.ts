import { formatDecimal } from '../numbers';
import type { ResultTone } from '../tone';
import type {
  DeltaDeltaReading,
  GlucoseFall,
  GlucoseFallReading,
  SubcutaneousTransition,
} from './calc';
import type { DkaSeverity, PotassiumBandId } from './content';
import type { KclReading } from './roteiro';

/**
 * Textos que no ANY moravam nas telas do KetoPath (KetoPath.tsx, KetoManejo,
 * KetoCiclo, KetoConsulta, KetoPlanilha), e não no `ketoData.ts`. Os que levam
 * limiar, dose ou leitura clínica ficam aqui, no motor, como o resto do
 * conteúdo (ADR-017: nenhum limiar mora em componente). Texto igual ao do ANY,
 * salvo onde o comentário diz.
 */

export const CAD_EHH_SUBTITLE = 'Crises hiperglicêmicas · ≥15 anos';

export const SCOPE_NOTE =
  'Cobre CAD, EHH e quadro misto. Não cobre pediatria, gestantes nem doença renal terminal em diálise.';

export const FIRST_HOUR_INTRO =
  'Nesta fase basta o que está à beira do leito. Nenhum resultado de laboratório é necessário para começar.';

export const NO_SEVERITY =
  'Sem pH ou bicarbonato dentro das faixas de acidose, a gravidade não é classificada.';

export const ALL_THREE_COMPONENTS = 'Os três componentes precisam estar presentes.';

export const MAINTENANCE_AFTER_LABS =
  'A reposição de manutenção e o gatilho da dextrose dependem do sódio corrigido — entram depois que os exames voltarem.';

export const MISSING = {
  phaseB: 'Informe sódio e glicemia no painel para ver a conduta da fase B.',
  weightForDeficit: 'Informe o peso para estimar o déficit.',
  weightForInsulin: 'Informe o peso para calcular a velocidade.',
  weightForTransition: 'Informe o peso para estimar a dose.',
  anionGap: 'Informe sódio, cloro e bicarbonato nos dados do paciente.',
  sodiumGlucose: 'Informe sódio e glicemia nos dados do paciente.',
  freeWater: 'Informe peso, sódio e glicemia nos dados do paciente.',
} as const;

/**
 * Seção da insulina sem potássio. O ANY dizia "Volte ao passo 4 e informe o
 * potássio", mas o potássio é digitado no passo 3 (Confirmar) e o passo do
 * potássio é o 6: a tela troca essa frase por um botão que leva ao passo 3
 * (achado de navegação). A frase clínica fica igual.
 */
export const INSULIN_LOCKED_REASON =
  'Iniciar insulina sem conhecer o potássio pode levar a arritmia com risco de vida.';

// ---- KCl ----

export const KCL_DILUENT_LABEL = 'SF 0,9% (diluente)';

export const KCL_FINAL_VOLUME_NOTE =
  'O volume final já inclui o KCl aspirado — o diluente acima é o complemento.';

export function kclMirrorNote(presentationLabel: string, mEqPerMl: string): string {
  return `Os dois campos se espelham. ${presentationLabel} tem ${mEqPerMl} mEq por mL.`;
}

export function kclExceedsText(
  concentration: number,
  max: number,
  routeLabel: string,
  minimumVolume: number,
): string {
  return `${concentration} mEq/L excede o máximo de ${max} mEq/L para ${routeLabel.toLowerCase()}. Considere aumentar o volume final para pelo menos ${minimumVolume} mL ou usar outra via.`;
}

// ---- Ciclo ----

export function shortIntervalText(minutes: number): string {
  return `Intervalo de ${minutes} min é curto demais para estimar a queda por hora. A titulação usa a variação em cerca de 1 hora.`;
}

/** Queda adequada. O ANY diz "50 a 70", mas a faixa adequada vai até 90 (achado). */
export const ADEQUATE_FALL = 'Dentro da faixa esperada de 50 a 70 mg/dL por hora.';

export const DELTA_DELTA_TEXT: Record<DeltaDeltaReading, string> = {
  hipercloremica:
    'Razão abaixo de 1 sugere acidose hiperclorêmica associada — o bicarbonato baixo pode ser o volume de salina infundido, não cetoacidose persistente.',
  'ag-puro':
    'Razão entre 1 e 2: acidose com ânion-gap elevado pura, sem distúrbio misto relevante.',
  alcalose:
    'Razão acima de 2 sugere alcalose metabólica associada — vômitos prolongados são a causa mais comum nesse contexto.',
};

export const RESOLUTION_CRITERIA = {
  required: { label: 'pH ≥7,3 ou bicarbonato ≥18 mEq/L', weight: 'obrigatório' },
  desirable: { label: 'Glicemia <200 mg/dL', weight: 'desejável' },
} as const;

export const RESOLVED_TEXT = 'Considere iniciar a transição para insulina subcutânea.';
export const NOT_RESOLVED_TEXT =
  'Enquanto o critério obrigatório não fecha, siga reavaliando as mesmas variáveis.';

/** "há 40 min", "há 1,5 h": tempo desde a rodada anterior, como no ANY. */
export function elapsedLabel(minutes: number): string {
  return minutes < 60 ? `há ${minutes} min` : `há ${formatDecimal(minutes / 60, 1)} h`;
}

/**
 * Título do cartão da queda: com intervalo curto, a variação absoluta; senão,
 * por hora.
 */
export function glucoseFallTitle(fall: GlucoseFall): string {
  const value = fall.extrapolable ? fall.perHour : fall.absolute;
  const direction = value >= 0 ? 'caiu' : 'subiu';
  const unit = fall.extrapolable ? 'mg/dL por hora' : 'mg/dL';
  return `Glicemia ${direction} ${Math.abs(value)} ${unit}`;
}

/** Dose diária e basal da transição, com as casas do ANY ("~21 U/dia", "10,5–21 U"). */
export function transitionDoseText(transition: SubcutaneousTransition): {
  totalDaily: string;
  basal: string;
} {
  const { totalDailyMin, totalDailyMax, basalMin, basalMax } = transition;
  const totalDaily =
    totalDailyMin === totalDailyMax
      ? `~${formatDecimal(totalDailyMin, 0)}`
      : `${formatDecimal(totalDailyMin, 0)}–${formatDecimal(totalDailyMax, 0)}`;
  return {
    totalDaily: `${totalDaily} U/dia`,
    basal: `${formatDecimal(basalMin, 1)}–${formatDecimal(basalMax, 0)} U`,
  };
}

/** Insulina por hora na diluição de 1 U/mL ("7,0 U/h = 7,0 mL/h"). */
export function insulinRateText(rate: number): { unitsPerHour: string; mlPerHour: string } {
  return {
    unitsPerHour: `${formatDecimal(rate, 1)} U/h`,
    mlPerHour: `${formatDecimal(rate, 1)} mL/h`,
  };
}

/**
 * Linhas da prescrição do KCl, como se escreve na prescrição (ANY): KCl a
 * aspirar, diluente, volume final, velocidade e a equivalência.
 */
export function kclPrescriptionLines(
  reading: KclReading,
): { label: string; value: string; strong: boolean; alert: boolean }[] {
  const { result } = reading;
  if (!result) return [];
  const { preparation, dose, rate, hours } = result;
  const rateValue =
    rate === null
      ? 'informe a velocidade'
      : `${formatDecimal(preparation.rateMlPerHour, 1)} mL/h${hours ? ` · ${formatDecimal(hours, 1)} h` : ''}`;
  return [
    {
      label: reading.presentation.label,
      value: `${formatDecimal(preparation.kclVolumeMl, 1)} mL`,
      strong: true,
      alert: false,
    },
    {
      label: KCL_DILUENT_LABEL,
      value: `${formatDecimal(result.diluentMl, 1)} mL`,
      strong: true,
      alert: false,
    },
    {
      label: 'Volume final',
      value: `${formatDecimal(result.finalVolumeMl, 0)} mL`,
      strong: false,
      alert: false,
    },
    { label: 'Correr a', value: rateValue, strong: true, alert: false },
    {
      label: 'Equivale a',
      value: `${formatDecimal(dose, 1)} mEq · ${formatDecimal(rate ?? 0, 0)} mEq/h`,
      strong: false,
      alert: false,
    },
    {
      label: 'Concentração',
      value: `${preparation.resultingConcentration} mEq/L`,
      strong: false,
      alert: preparation.exceedsLimit,
    },
  ];
}

// ---- Calculadoras ----

/** Corte do ânion-gap na tela Calculadoras do KetoPath (a calculadora do motor usa 14). */
export const ANION_GAP_HIGH_ABOVE = 12;

export const ANION_GAP_TEXT = {
  high: 'Ânion-gap acima de 12 mEq/L indica acidose metabólica com ânion-gap elevado, compatível com CAD.',
  normal: 'Ânion-gap dentro da faixa habitual.',
} as const;

export const FORMULAS = {
  anionGap: 'AG = Na − (Cl + HCO₃)',
  correctedSodium: 'Na corrigido = Na medido + 2,0 × [(glicemia − 100) / 100]',
  effectiveOsmolality: 'Osm efetiva = (2 × Na) + (glicemia / 18)',
  effectiveOsmolalityNote: 'Usa o sódio medido, não o corrigido.',
  totalBodyWater: 'ACT = peso × fator',
  freeWaterDeficit: 'Déficit = ACT × [(Na corrigido / 140) − 1]',
} as const;

// ---- Planilha ----

export const WORKSHEET_INTRO =
  'Formulário em branco para impressão e fixação no leito. Não preenche, não calcula e não guarda nada — a hora é anotada à mão.';

export const WORKSHEET_PRINT_TIP =
  'Escolha paisagem na caixa de impressão — são 19 colunas. No iPhone, a mesma caixa oferece "Salvar em Arquivos" para gerar o PDF.';

export const WORKSHEET_HEADER_FIELDS = [
  'Nome do paciente: ______________________________________',
  'Registro: ______________',
  'Peso: ________ kg',
  'Data: ____ / ____ / ______',
  'Diagnóstico: ( ) CAD\u00a0\u00a0( ) EHH\u00a0\u00a0( ) Misto',
] as const;

// ---- Tons (ADR-017: o motor diz o significado, a tela escolhe a cor) ----

/** Gravidade: grave vermelho, moderada amarelo e leve verde no ANY. */
export const SEVERITY_TONE: Record<DkaSeverity, ResultTone> = {
  leve: 'neutral',
  moderada: 'attention',
  grave: 'critical',
};

/** Queda da glicemia: rápida vermelho, insuficiente amarelo, adequada verde no ANY. */
export const FALL_TONE: Record<GlucoseFallReading, ResultTone> = {
  adequada: 'neutral',
  insuficiente: 'attention',
  rapida: 'critical',
};

/** Potássio no ciclo: baixo vermelho, alto amarelo, alvo verde no ANY. */
export const POTASSIUM_TONE: Record<PotassiumBandId, ResultTone> = {
  baixo: 'critical',
  alvo: 'neutral',
  alto: 'attention',
};

/** Delta/delta: hiperclorêmica azul, alcalose amarelo, pura verde no ANY. */
export const DELTA_DELTA_TONE: Record<DeltaDeltaReading, ResultTone> = {
  hipercloremica: 'neutral',
  'ag-puro': 'neutral',
  alcalose: 'attention',
};
