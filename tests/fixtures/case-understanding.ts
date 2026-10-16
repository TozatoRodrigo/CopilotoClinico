import type { CaseUnderstanding } from '../../src/shared/contracts/clinical';

/**
 * F1 — entendimento válido de um caso de AVC sem TC (o caso que motivou a
 * ADR-013), usado pelos specs da Etapa 1, do orquestrador e do prompt.
 */
export function understandingFixture(
  overrides: Partial<CaseUnderstanding> = {},
): CaseUnderstanding {
  return {
    problemRepresentation:
      'Homem de 68 anos com hemiparesia direita e afasia de início súbito há 1h30, sem TC.',
    structuredData: {
      age: 68,
      sex: 'M',
      vitals: {
        systolicBp: 182,
        diastolicBp: 104,
        heartRate: 88,
        respiratoryRate: null,
        spo2: 96,
        temperature: null,
        glucose: null,
      },
      onset: 'há 1h30',
      keyFindings: ['hemiparesia direita', 'afasia'],
      relevantContext: [],
    },
    instability: { present: false, findings: [] },
    syndrome: 'deficit-neurologico-focal',
    syndromeNote: null,
    cannotMiss: [
      {
        hypothesis: 'AVC isquêmico por oclusão de grande vaso',
        whyPlausible: 'Déficit cortical súbito dentro da janela de reperfusão',
        confirmOrRuleOut: 'Angio-TC de crânio e pescoço',
      },
      {
        hypothesis: 'Hemorragia intracerebral',
        whyPlausible: 'PA elevada e déficit súbito',
        confirmOrRuleOut: 'TC de crânio sem contraste',
      },
      {
        hypothesis: 'Hipoglicemia',
        whyPlausible: 'Mimetiza déficit focal agudo',
        confirmOrRuleOut: 'Glicemia capilar',
      },
    ],
    likely: [{ hypothesis: 'AVC isquêmico', why: 'Déficit focal súbito em idoso hipertenso' }],
    missingDiscriminators: [
      {
        data: 'Resultado da TC de crânio sem contraste',
        separates: ['AVC isquêmico', 'AVC hemorrágico'],
        whyItChangesConduct: 'Trombólise só depois de excluir sangramento',
      },
      {
        data: 'Glicemia capilar',
        separates: ['Hipoglicemia', 'AVC'],
        whyItChangesConduct: 'Hipoglicemia se corrige com glicose, sem trombólise',
      },
    ],
    searchQueries: [
      'manejo inicial do AVC agudo',
      'trombectomia mecânica oclusão de grande vaso',
      'hemorragia intracerebral controle pressórico',
    ],
    timeCritical: false,
    ...overrides,
  };
}
