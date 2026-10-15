import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/** Porte do `rockall` do ANY. Itens, pontos e faixas iguais; ações como sugestão. */
export const ROCKALL: ScoreCalculator = {
  kind: 'score',
  id: 'rockall',
  name: 'Rockall Score',
  aliases: ['rockall', 'hda', 'hemorragia digestiva', 'sangramento gi alto'],
  category: 'Gastro / Hepato',
  description: 'Risco de ressangramento e mortalidade em hemorragia digestiva alta.',
  reference: {
    why: 'A versão pré-endoscópica permite estratificar antes da endoscopia; a completa inclui os achados endoscópicos.',
    whenToUse: 'Pacientes com hemorragia digestiva alta no DE.',
    pearlsPitfalls: [
      'Escore pré-endoscópico (0–7) usa idade, choque e comorbidades.',
      'Escore completo (0–11) adiciona diagnóstico endoscópico e sinais de sangramento recente.',
      'Escore pré-endoscópico 0 = mortalidade ~0,2%: considere alta com EDA ambulatorial.',
      'Não avalia necessidade de transfusão: usar o Glasgow-Blatchford para essa decisão.',
    ],
    citation:
      'Rockall TA et al. Risk assessment after acute upper gastrointestinal haemorrhage. Gut. 1996;38(3):316-21.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('age', 'Idade', [
      ['lt60', '< 60 anos', 0],
      ['60-79', '60–79 anos', 1],
      ['gte80', '≥ 80 anos', 2],
    ]),
    choiceItem('shock', 'Sinais de choque', [
      ['sem', 'Sem choque (FC < 100, PAS ≥ 100)', 0],
      ['taquicardia', 'Taquicardia (FC ≥ 100, PAS ≥ 100)', 1],
      ['hipotensao', 'Hipotensão (PAS < 100)', 2],
    ]),
    choiceItem('comorbidity', 'Comorbidades', [
      ['nenhuma', 'Nenhuma comorbidade maior', 0],
      ['maior', 'IC, DCI ou outra comorbidade maior', 2],
      ['grave', 'Insuficiência renal, insuficiência hepática ou câncer disseminado', 3],
    ]),
    choiceItem('diagnosis', 'Diagnóstico endoscópico (se disponível)', [
      ['sem-eda', 'Não avaliado / sem EDA', 0],
      ['mallory', 'Mallory-Weiss, sem lesão ou sem sinais de sangramento recente', 0],
      ['outros', 'Todos os outros diagnósticos', 1],
      ['neoplasia', 'Neoplasia do TGI alto', 2],
    ]),
    choiceItem('stigmata', 'Sinais de sangramento recente na EDA', [
      ['nao', 'Não avaliado / base limpa ou mancha plana', 0],
      ['sim', 'Sangue no TGI alto, coágulo aderente, vaso visível ou jato', 2],
    ]),
  ],
  interpretation: {
    bands: [
      {
        id: 'baixo',
        upTo: { value: 2, inclusive: true },
        label: 'Baixo risco',
        tone: 'neutral',
        action:
          'Mortalidade ~0–5%. Considere alta precoce com EDA ambulatorial se o escore pré-endoscópico for 0.',
      },
      {
        id: 'intermediario',
        upTo: { value: 4, inclusive: true },
        label: 'Risco intermediário',
        tone: 'attention',
        action: 'Mortalidade ~5–11%. Internação e EDA dentro de 24 h recomendadas.',
      },
    ],
    otherwise: {
      id: 'alto',
      label: 'Alto risco',
      tone: 'critical',
      action: 'Mortalidade ~24–40%. Considere EDA de urgência, UTI e suporte hemodinâmico.',
    },
  },
};
