import type { EncounterContext } from "@/lib/types";

export interface DemoCasePreset {
  slug: string;
  title: string;
  summary: string;
  patientRef: string;
  vertical: string;
  context: EncounterContext;
  caseText: string;
}

export const DEMO_CASE_PRESETS: DemoCasePreset[] = [
  {
    slug: "sindrome-gripal",
    title: "Síndrome gripal >48h",
    summary: "Caso canônico com dúvida sobre grupo de risco e antiviral após 48 horas.",
    patientRef: "Demo Gripal 48h",
    vertical: "general",
    context: {
      hasCT: false,
      isSus: true,
      hasLab: true,
      hasICU: false,
    },
    caseText:
      "Paciente adulto com síndrome gripal há 3 dias, febre, tosse seca e mialgia. Saturando 96% em ar ambiente, sem sinais de SRAG no momento. Relata antecedente de doença autoimune, mas não informa se faz uso atual de imunossupressor.",
  },
  {
    slug: "dor-toracica",
    title: "Dor torácica aguda",
    summary: "Fluxo de risco imediato com anti-ancoragem para SCA e diagnósticos diferenciais graves.",
    patientRef: "Demo Dor Torácica",
    vertical: "cardiac",
    context: {
      hasCT: false,
      isSus: false,
      hasLab: true,
      hasICU: true,
    },
    caseText:
      "Paciente de 58 anos com dor torácica súbita em aperto há 40 minutos, irradiando para braço esquerdo, associada a sudorese e náusea. Frequência cardíaca 108 bpm, pressão 95 por 60 mmHg, sem trauma recente relatado.",
  },
  {
    slug: "sepse",
    title: "Sepse na 1ª hora",
    summary: "Reconhecimento inicial com bundle da primeira hora e reavaliação hemodinâmica.",
    patientRef: "Demo Sepse 1h",
    vertical: "general",
    context: {
      hasCT: false,
      isSus: true,
      hasLab: true,
      hasICU: true,
    },
    caseText:
      "Paciente com febre, rebaixamento do estado geral e provável foco urinário. Pressão 88 por 54 mmHg, frequência cardíaca 122 bpm, temperatura 39,1 graus, lactato ainda não coletado e diurese reduzida nas últimas horas.",
  },
];

export function getDemoCasePreset(slug: string | null | undefined): DemoCasePreset | null {
  if (!slug) return null;
  return DEMO_CASE_PRESETS.find((preset) => preset.slug === slug) ?? null;
}
