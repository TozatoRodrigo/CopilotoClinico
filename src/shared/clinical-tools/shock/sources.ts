import type { ContentProvenance } from '../provenance';

/**
 * Origem do conteúdo de choque (CC-316 e CC-317): a tela ShockPath do ANY App
 * v4 e as contas de `utils/calculations.ts` (VNERi, quadrante, lactato).
 */
export const ANY_V4_SHOCK_SOURCE = 'ANY App v4 · ShockPath.tsx e calculations.ts (95c8fba)';

/** Roteiro do choque séptico (ANDROMEDA-SHOCK 2), CC-316. */
export const SEPTIC_SHOCK_PROVENANCE: ContentProvenance = {
  source: ANY_V4_SHOCK_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

/** Choque indiferenciado: VTI, VNERi e gap CO2 × SvcO2, CC-317. */
export const UNDIFFERENTIATED_SHOCK_PROVENANCE: ContentProvenance = {
  source: ANY_V4_SHOCK_SOURCE,
  version: '1.0.0',
  updatedAt: '2026-10-15',
  review: { status: 'pendente' },
};

export interface ShockReference {
  id: string;
  authors: string;
  /** Citação como está no ANY (só acentuação corrigida). */
  citation: string;
  /** O que a referência sustenta no roteiro. */
  note: string;
}

/**
 * Tela "Referências" do ShockPath, na ordem do ANY. A citação do
 * ANDROMEDA-SHOCK 2 vai como o ANY a escreveu; o título e o ano estão na
 * revisão clínica (docs/ferramentas/revisao-clinica/choque.md).
 */
export const SHOCK_REFERENCES = {
  andromedaShock2: {
    id: 'andromeda-shock-2',
    authors: 'Hernandez G, et al.',
    citation:
      'Effect of a Resuscitation Strategy Targeting Peripheral Perfusion Status vs Serum Lactate Levels on 28-Day Mortality Among Patients With Septic Shock: The ANDROMEDA-SHOCK 2 Randomized Clinical Trial. JAMA. 2025.',
    note: 'Protocolo CRT-PHR: ressuscitação guiada por TEC.',
  },
  goury: {
    id: 'goury-2025',
    authors: 'Goury A, et al.',
    citation:
      'Vascular Norepinephrine Responsiveness index (VNERi) and mortality in septic shock: a J-shaped relationship. Ann Intensive Care. 2025;15:23.',
    note: 'VNERi = PAD / (dose NE × FC). Nadir de mortalidade em 6,7.',
  },
  bertrand: {
    id: 'bertrand-2025',
    authors: 'Bertrand A, et al.',
    citation:
      'Diastolic arterial pressure monitoring in septic shock: clinical implications. Ann Intensive Care. 2025;15:18.',
    note: 'PAD < 50 mmHg como marcador de vasoplegia.',
  },
  ltaief: {
    id: 'ltaief-2021',
    authors: 'Ltaief Z, et al.',
    citation:
      'Venous-to-arterial carbon dioxide difference and central venous oxygen saturation in the assessment of tissue perfusion in septic shock: a prospective study. Critical Care. 2021;25:266.',
    note: 'Gap CO2 × SvcO2: quadrantes perfusionais.',
  },
  survivingSepsis2021: {
    id: 'ssc-2021',
    authors: 'Evans L, et al.',
    citation:
      'Surviving Sepsis Campaign: International Guidelines for Management of Sepsis and Septic Shock 2021. Intensive Care Med. 2021;47:1181-1247.',
    note: 'Diretrizes gerais de manejo do choque séptico.',
  },
  andromedaShock: {
    id: 'andromeda-shock',
    authors: 'Hernandez G, et al.',
    citation:
      'Effect of a Resuscitation Strategy Targeting Peripheral Perfusion Status vs Serum Lactate Levels on 28-Day Mortality Among Patients With Septic Shock: The ANDROMEDA-SHOCK Randomized Clinical Trial. JAMA. 2019;321(7):654-664.',
    note: 'ANDROMEDA-SHOCK original: TEC × lactato.',
  },
  mercadal: {
    id: 'mercadal-2022',
    authors: 'Mercadal J, et al.',
    citation: 'VTI-based algorithm in hemodynamic shock assessment. The Ultrasound Journal. 2022.',
    note: 'Algoritmo baseado no VTI para classificar o choque indiferenciado.',
  },
} as const satisfies Record<string, ShockReference>;

/** Referências do roteiro do choque séptico, na ordem do ANY. */
export const SEPTIC_SHOCK_REFERENCES: readonly ShockReference[] = [
  SHOCK_REFERENCES.andromedaShock2,
  SHOCK_REFERENCES.goury,
  SHOCK_REFERENCES.bertrand,
  SHOCK_REFERENCES.ltaief,
  SHOCK_REFERENCES.survivingSepsis2021,
  SHOCK_REFERENCES.andromedaShock,
];

/** Referências do choque indiferenciado (VTI, VNERi e gap CO2 × SvcO2). */
export const UNDIFFERENTIATED_SHOCK_REFERENCES: readonly ShockReference[] = [
  SHOCK_REFERENCES.mercadal,
  SHOCK_REFERENCES.goury,
  SHOCK_REFERENCES.ltaief,
];
