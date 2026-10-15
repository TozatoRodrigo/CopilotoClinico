import { formatCompact, formatWeight } from '../numbers';
import { validateWeight, type NumericFieldResult } from '../ranges';
import {
  CHOICE_SECTIONS,
  COLLABORATIVE,
  COMBATIVE,
  FINAL_SCREENS,
  IV_PREPARATION,
  KETOFOL_SCREEN,
  LOW_COOPERATION,
  NO_SEDATION,
  NON_URGENT,
  ORAL_SEDATION,
  RECENT_SEDATION_QUESTION,
  SEDATION_PROVENANCE,
  URGENT,
  URGENT_IM,
  type ChoiceSection,
  type CombativeRegimen,
  type MedicationOption,
  type RegimenCard,
  type SedationChecklistId,
  type SedationChoiceId,
  type SedationNotice,
  type SedationScreen,
  type UrgentImDrug,
} from './content';
import {
  formatRegimen,
  KETAMINE_IM,
  ketamineImDose,
  ketamineImTexts,
  KETOFOL,
  ketofolDoses,
  ketofolEachText,
  ketofolVolumeText,
  REGIMENS,
  type KetamineImDose,
  type KetofolDose,
  type KetofolDoses,
  type RegimenId,
} from './doses';
import {
  asksRecentSedation,
  availableChoices,
  currentScreen,
  isKetofolReduced,
  nextStep,
  visibleChecklists,
  type SedationState,
} from './state';

/**
 * O que a tela do roteiro mostra, na ordem do ANY, calculado do estado e do
 * peso digitado. A tela só desenha cada bloco; o teste de paridade com o ANY
 * percorre os mesmos blocos. Puro: o mesmo estado e o mesmo peso dão sempre a
 * mesma tela.
 */
export type SedationBlock =
  /** Aviso (o AlertCard e os quadros coloridos do ANY). */
  | { kind: 'notice'; notice: SedationNotice }
  /** Pergunta em destaque ("A sedação é realmente necessária?"). */
  | { kind: 'question'; title: string; text: string }
  /** Desfecho da tela ("Procedimento sem sedação"). */
  | { kind: 'outcome'; title: string; text: string }
  | { kind: 'regimen'; card: RegimenCard }
  | { kind: 'choices'; section: ChoiceSection; choices: readonly SedationChoiceId[] }
  | { kind: 'recent-sedation'; question: string; answer: boolean }
  | {
      kind: 'urgent-im';
      legend: string;
      options: readonly MedicationOption<UrgentImDrug>[];
      selected: UrgentImDrug | null;
    }
  | {
      kind: 'combative';
      legend: string;
      options: readonly MedicationOption<CombativeRegimen>[];
      selected: CombativeRegimen | null;
    }
  /** Calculadora da cetamina IM; `dose` só com peso válido. */
  | { kind: 'ketamine-calculator'; dose: KetamineImDose | null }
  | { kind: 'checklist'; id: SedationChecklistId }
  | { kind: 'red-flags' }
  | { kind: 'ketofol-mixture' }
  | { kind: 'ketofol-doses'; basis: SedationNotice; doses: KetofolDoses | null }
  | { kind: 'monitoring' }
  | { kind: 'complications' };

export interface SedationView {
  screen: SedationScreen;
  path: readonly SedationScreen[];
  blocks: readonly SedationBlock[];
  /** Botão de avançar ("Calcular cetofol"), quando liberado. */
  next: { label: string; target: SedationScreen } | null;
  /** Tela final: o ANY oferece só "Novo paciente". */
  final: boolean;
  /** A tela tem conta por peso (calculadora da cetamina IM ou cetofol). */
  needsWeight: boolean;
  weight: NumericFieldResult;
}

/** A calculadora da cetamina IM aparece quando ela é a medicação escolhida. */
export function showsKetamineCalculator(state: SedationState): boolean {
  const screen = currentScreen(state);
  return (
    (screen === 'im-urgente' && state.urgentImDrug === 'cetamina') ||
    (screen === 'combativo' && state.combativeRegimen === 'cetamina')
  );
}

/** Aviso da base de dose do cetofol: metade com sedação prévia, senão a dose padrão. */
export function ketofolBasis(reduced: boolean): SedationNotice {
  if (reduced) return KETOFOL_SCREEN.reduced;
  return {
    tone: 'info',
    title: KETOFOL_SCREEN.standardTitle,
    lines: [`${formatCompact(KETOFOL.induction.standardMgPerKg)} mg/kg de cada componente`],
  };
}

function notice(value: SedationNotice): SedationBlock {
  return { kind: 'notice', notice: value };
}

function choicesBlock(screen: SedationScreen, state: SedationState): SedationBlock[] {
  const section = CHOICE_SECTIONS[screen];
  const choices = availableChoices(state);
  return section && choices.length > 0 ? [{ kind: 'choices', section, choices }] : [];
}

function checklists(state: SedationState): SedationBlock[] {
  return visibleChecklists(state).map((id) => ({ kind: 'checklist', id }));
}

function recentSedationBlock(state: SedationState, screen: SedationScreen): SedationBlock[] {
  if (!asksRecentSedation(state)) return [];
  if (screen !== 'pouco-colaborativo' && screen !== 'preparo-iv') return [];
  return [
    {
      kind: 'recent-sedation',
      question: RECENT_SEDATION_QUESTION[screen],
      answer: state.recentSedation,
    },
  ];
}

function blocksOf(state: SedationState, weightKg: number | null): SedationBlock[] {
  const screen = currentScreen(state);
  const ketamine: SedationBlock[] = showsKetamineCalculator(state)
    ? [{ kind: 'ketamine-calculator', dose: weightKg === null ? null : ketamineImDose(weightKg) }]
    : [];
  switch (screen) {
    case 'triagem':
    case 'urgente':
      return [
        ...(screen === 'urgente' ? [notice(URGENT.alert)] : []),
        ...choicesBlock(screen, state),
      ];
    case 'colaborativo':
      return [
        { kind: 'question', title: COLLABORATIVE.question, text: COLLABORATIVE.hint },
        ...choicesBlock(screen, state),
      ];
    case 'sem-sedacao':
      return [
        { kind: 'outcome', title: NO_SEDATION.result, text: NO_SEDATION.detail },
        notice(NO_SEDATION.tip),
      ];
    case 'sedacao-vo':
      return [
        { kind: 'regimen', card: ORAL_SEDATION.card },
        notice(ORAL_SEDATION.pain),
        ...choicesBlock(screen, state),
      ];
    case 'pouco-colaborativo':
      return [
        notice(LOW_COOPERATION.deescalation),
        ...recentSedationBlock(state, screen),
        ...(state.recentSedation
          ? [notice(LOW_COOPERATION.alreadySedated)]
          : [
              { kind: 'regimen', card: LOW_COOPERATION.oralFirst } as const,
              notice(LOW_COOPERATION.oralFailure),
            ]),
        ...choicesBlock(screen, state),
      ];
    case 'im-urgente':
      return [
        notice(URGENT_IM.intro),
        {
          kind: 'urgent-im',
          legend: URGENT_IM.legend,
          options: URGENT_IM.options,
          selected: state.urgentImDrug,
        },
        notice(URGENT_IM.midazolamCaution),
        ...ketamine,
        ...checklists(state),
      ];
    case 'nao-urgente':
      return [
        { kind: 'regimen', card: NON_URGENT.card },
        ...checklists(state),
        ...choicesBlock(screen, state),
      ];
    case 'combativo':
      return [
        notice(COMBATIVE.risk),
        {
          kind: 'combative',
          legend: COMBATIVE.legend,
          options: COMBATIVE.options,
          selected: state.combativeRegimen,
        },
        notice(COMBATIVE.midazolamContraindication),
        ...ketamine,
        ...checklists(state),
        ...choicesBlock(screen, state),
      ];
    case 'preparo-iv':
      // Com a VO insuficiente o ANY troca a pergunta das 4 h pelo aviso de sedação prévia.
      return [
        notice(IV_PREPARATION.environment),
        ...(state.oralSedationFailed ? [notice(IV_PREPARATION.oralGiven)] : []),
        ...recentSedationBlock(state, screen),
        ...(asksRecentSedation(state) && state.recentSedation
          ? [notice(IV_PREPARATION.reducedSuggestion)]
          : []),
        { kind: 'red-flags' },
        ...checklists(state),
      ];
    case 'cetofol': {
      const reduced = isKetofolReduced(state);
      return [
        { kind: 'ketofol-mixture' },
        {
          kind: 'ketofol-doses',
          basis: ketofolBasis(reduced),
          doses: weightKg === null ? null : ketofolDoses(weightKg, reduced),
        },
      ];
    }
    case 'durante':
      return [{ kind: 'monitoring' }, { kind: 'complications' }];
    case 'pos':
      return checklists(state);
  }
}

export function deriveSedation(state: SedationState, weightRaw: string): SedationView {
  const screen = currentScreen(state);
  const weight = validateWeight(weightRaw, 'adulto');
  return {
    screen,
    path: state.path,
    blocks: blocksOf(state, weight.ok ? weight.value : null),
    next: nextStep(state),
    final: FINAL_SCREENS.includes(screen),
    needsWeight: showsKetamineCalculator(state) || screen === 'cetofol',
    weight,
  };
}

// ---- Texto para o prontuário ------------------------------------------------

const COOPERATION_LABEL: Partial<Record<SedationScreen, string>> = {
  colaborativo: 'Colaborativo',
  'pouco-colaborativo': 'Pouco colaborativo',
  combativo: 'Combativo / agitação grave',
};

function yesNo(value: boolean): string {
  return value ? 'Sim' : 'Não';
}

function regimenText(id: RegimenId): string {
  return formatRegimen(REGIMENS[id], { names: true });
}

function ketamineText(weightKg: number | null): string {
  const base = regimenText('cetamina-im');
  if (weightKg === null) return base;
  const { dose, volume } = ketamineImTexts(ketamineImDose(weightKg));
  return `${base}: ${dose} (${volume} de ${KETAMINE_IM.concentrationMgPerMl} mg/mL)`;
}

function ketofolDoseText(dose: KetofolDose): string {
  return `${ketofolEachText(dose)} (${ketofolVolumeText(dose)})`;
}

/** Medicação escolhida numa lista de opções, com a dose da cetamina pelo peso. */
function medicationText(regimen: RegimenId, weightKg: number | null): string {
  return regimen === 'cetamina-im' ? ketamineText(weightKg) : regimenText(regimen);
}

/**
 * Texto pronto para colar no prontuário: o caminho do roteiro, as respostas e
 * a conduta sugerida com as doses da tela. Sem nome de paciente nem horário (o
 * prontuário carimba os dois). `null` enquanto nada foi escolhido.
 */
export function buildSedationChartNote(state: SedationState, weightRaw: string): string | null {
  const { path } = state;
  if (path.length < 2) return null;
  const weight = validateWeight(weightRaw, 'adulto');
  const weightKg = weight.ok ? weight.value : null;
  const passed = (screen: SedationScreen) => path.includes(screen);
  const cooperation = path[1];
  const lines = ['Sedação procedimental e agitação (roteiro sugerido):'];
  let usedWeight = false;

  if (cooperation && COOPERATION_LABEL[cooperation]) {
    lines.push(`- Grau de colaboração: ${COOPERATION_LABEL[cooperation]}`);
  }
  if (passed('sem-sedacao') && !passed('sedacao-vo')) lines.push('- Procedimento sem sedação');
  if (passed('sedacao-vo')) {
    const options = ORAL_SEDATION.card.regimens.map(regimenText);
    lines.push(`- Sedação VO: ${options.join(' ou ')}`);
  }
  if (state.oralSedationFailed) lines.push('- Resposta à sedação VO: insuficiente');
  if (passed('pouco-colaborativo')) {
    lines.push(`- Sedação nas últimas 4 h: ${yesNo(state.recentSedation)}`);
  }
  if (passed('urgente')) {
    lines.push(`- Urgência: urgente, ${passed('im-urgente') ? 'sem acesso IV' : 'com acesso IV'}`);
  }
  if (passed('nao-urgente')) {
    lines.push('- Urgência: não urgente');
    lines.push(`- Medicação IM: ${regimenText('haloperidol-prometazina-im')}`);
  }
  const urgentIm = URGENT_IM.options.find(({ id }) => id === state.urgentImDrug);
  if (passed('im-urgente') && urgentIm) {
    lines.push(`- Medicação IM: ${medicationText(urgentIm.regimen, weightKg)}`);
    usedWeight ||= urgentIm.regimen === 'cetamina-im';
  }
  const combative = COMBATIVE.options.find(({ id }) => id === state.combativeRegimen);
  if (passed('combativo') && combative) {
    lines.push(`- Contenção química: ${medicationText(combative.regimen, weightKg)}`);
    usedWeight ||= combative.regimen === 'cetamina-im';
  }
  if (passed('cetofol')) {
    const reduced = isKetofolReduced(state);
    const basis = reduced ? ', doses reduzidas pela metade (sedação prévia)' : '';
    if (weightKg === null) {
      lines.push(`- Cetofol 1:1 IV${basis}`);
    } else {
      const { induction, maintenance } = ketofolDoses(weightKg, reduced);
      lines.push(
        `- Cetofol 1:1 IV: indução ${ketofolDoseText(induction)}; manutenção ${ketofolDoseText(maintenance)}${basis}`,
      );
      usedWeight = true;
    }
  }
  if (usedWeight && weightKg !== null) lines.push(`- Peso: ${formatWeight(weightKg)}`);
  const { review } = SEDATION_PROVENANCE;
  const reviewText =
    review.status === 'revisado'
      ? `revisado por ${review.reviewer} (CRM ${review.crm})`
      : 'revisão clínica pendente';
  lines.push(`Fonte: ${SEDATION_PROVENANCE.source}, ${reviewText}.`);
  return lines.join('\n');
}
