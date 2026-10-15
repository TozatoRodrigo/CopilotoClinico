import { describe, expect, it } from 'vitest';
import {
  CHOICE_SECTIONS,
  COLLABORATIVE,
  COMBATIVE,
  DURING,
  FINAL_SCREENS,
  IV_PREPARATION,
  KETAMINE_CALCULATOR,
  KETOFOL_SCREEN,
  LOW_COOPERATION,
  NO_SEDATION,
  NON_URGENT,
  ORAL_SEDATION,
  RECENT_SEDATION_QUESTION,
  RED_FLAG_IDS,
  RED_FLAGS,
  SCREEN_INFO,
  SEDATION_CHECK_IDS,
  SEDATION_CHECKLISTS,
  SEDATION_CHOICE_IDS,
  SEDATION_CHOICES,
  SEDATION_NEXT,
  SEDATION_PROVENANCE,
  SEDATION_SCREENS,
  URGENT,
  URGENT_IM,
  type SedationNotice,
  type SedationScreen,
} from './content';

/** Mesma regra de linguagem das calculadoras (registry.spec.ts, ADR-017). */
const IMPERATIVE_START =
  /(^|[.:;]\s+)(Faça|Inicie|Administre|Realize|Aplique|Intube|Transfunda|Prescreva)\b/;

/** Ordem no imperativo que o ANY usava em recomendação ("Mantenha", "Reduza", "Otimize"…). */
const ORDERS = /(^|[.:;→]\s*)(Mantenha|Reduza|Otimize|Evite|Use|Confirme|Limite)\b/;

function noticeTexts(notice: SedationNotice): string[] {
  return [notice.title, ...notice.lines];
}

function allTexts(): string[] {
  return [
    ...Object.values(SCREEN_INFO).flatMap(({ title, trail }) => [title, trail]),
    ...Object.values(SEDATION_CHOICES).flatMap(({ title, description }) => [title, description]),
    ...Object.values(CHOICE_SECTIONS).flatMap((section) => [
      section?.title ?? '',
      section?.prompt ?? '',
    ]),
    ...Object.values(SEDATION_NEXT).map((next) => next?.label ?? ''),
    ...Object.values(RECENT_SEDATION_QUESTION),
    COLLABORATIVE.question,
    COLLABORATIVE.hint,
    NO_SEDATION.result,
    NO_SEDATION.detail,
    ...noticeTexts(NO_SEDATION.tip),
    ORAL_SEDATION.card.title,
    ...ORAL_SEDATION.card.notes,
    ...noticeTexts(ORAL_SEDATION.pain),
    ...noticeTexts(LOW_COOPERATION.deescalation),
    LOW_COOPERATION.oralFirst.title,
    ...LOW_COOPERATION.oralFirst.notes,
    ...noticeTexts(LOW_COOPERATION.oralFailure),
    ...noticeTexts(LOW_COOPERATION.alreadySedated),
    ...noticeTexts(URGENT.alert),
    ...noticeTexts(URGENT_IM.intro),
    ...URGENT_IM.options.flatMap((option) => [option.timing, option.preferIf ?? '']),
    ...noticeTexts(URGENT_IM.midazolamCaution),
    NON_URGENT.card.title,
    ...NON_URGENT.card.notes,
    ...noticeTexts(COMBATIVE.risk),
    COMBATIVE.legend,
    ...COMBATIVE.options.flatMap((option) => [option.timing, option.preferIf ?? '']),
    ...noticeTexts(COMBATIVE.midazolamContraindication),
    ...Object.values(KETAMINE_CALCULATOR),
    ...noticeTexts(IV_PREPARATION.environment),
    ...noticeTexts(IV_PREPARATION.oralGiven),
    ...noticeTexts(IV_PREPARATION.reducedSuggestion),
    IV_PREPARATION.redFlagsTitle,
    IV_PREPARATION.redFlagsHint,
    ...RED_FLAGS.flatMap((flag) => [
      flag.title,
      flag.emphasis ?? '',
      ...flag.paragraphs,
      flag.listTitle ?? '',
      ...flag.items,
    ]),
    ...noticeTexts(KETOFOL_SCREEN.reduced),
    KETOFOL_SCREEN.maintenanceRepeat,
    ...DURING.monitoring.flatMap(({ title, detail }) => [title, detail]),
    ...DURING.complications.flatMap(noticeTexts),
    ...Object.values(SEDATION_CHECKLISTS).flatMap((checklist) => [
      checklist.title,
      ...('intro' in checklist ? [checklist.intro] : []),
      ...('notice' in checklist ? noticeTexts(checklist.notice) : []),
      ...checklist.items.map(({ title }) => title),
    ]),
  ].filter((text) => text !== '');
}

/** Telas que se alcançam da triagem pelos cartões de opção e pelos botões de avançar. */
function reachable(): Set<SedationScreen> {
  const seen = new Set<SedationScreen>(['triagem']);
  const queue: SedationScreen[] = ['triagem'];
  while (queue.length > 0) {
    const screen = queue.shift() as SedationScreen;
    const targets = [
      ...(CHOICE_SECTIONS[screen]?.choices ?? []).map((id) => SEDATION_CHOICES[id].target),
      ...(SEDATION_NEXT[screen] ? [SEDATION_NEXT[screen].target] : []),
    ];
    for (const target of targets) {
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return seen;
}

describe('conteúdo do roteiro de sedação', () => {
  it('tem as 13 telas do SedaPath, todas alcançáveis da triagem', () => {
    expect(SEDATION_SCREENS).toHaveLength(13);
    expect([...reachable()].sort()).toEqual([...SEDATION_SCREENS].sort());
  });

  it('toda tela que não é final tem para onde seguir', () => {
    for (const screen of SEDATION_SCREENS) {
      if (FINAL_SCREENS.includes(screen)) continue;
      const hasWay = Boolean(CHOICE_SECTIONS[screen] ?? SEDATION_NEXT[screen]);
      expect(hasWay, screen).toBe(true);
    }
  });

  it('cada escolha aparece em uma só tela', () => {
    const placed = Object.values(CHOICE_SECTIONS).flatMap((section) => section?.choices ?? []);
    expect([...placed].sort()).toEqual([...SEDATION_CHOICE_IDS].sort());
  });

  it('não repete id de item de checklist nem de red flag', () => {
    expect(new Set(SEDATION_CHECK_IDS).size).toBe(SEDATION_CHECK_IDS.length);
    expect(RED_FLAGS.map(({ id }) => id)).toEqual([...RED_FLAG_IDS]);
  });

  it('a VO insuficiente é a única escolha que marca sedação prévia', () => {
    const marking = SEDATION_CHOICE_IDS.filter(
      (id) => SEDATION_CHOICES[id].marksOralSedationFailed,
    );
    expect(marking).toEqual(['vo-insuficiente']);
  });

  it('traz procedência com versão e revisão', () => {
    expect(SEDATION_PROVENANCE.source).toContain('SedaPath');
    expect(SEDATION_PROVENANCE.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(SEDATION_PROVENANCE.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(SEDATION_PROVENANCE.review.status).toBe('pendente');
  });

  it('sugere em vez de mandar', () => {
    for (const text of allTexts()) {
      expect(text, text).not.toMatch(IMPERATIVE_START);
      expect(text, text).not.toMatch(ORDERS);
      expect(text, text).not.toMatch(/imediatamente/i);
    }
  });

  it('usa cetamina e cetofol (DCB), não ketamina e ketofol', () => {
    for (const text of allTexts()) expect(text, text).not.toMatch(/keta|keto/i);
  });
});
