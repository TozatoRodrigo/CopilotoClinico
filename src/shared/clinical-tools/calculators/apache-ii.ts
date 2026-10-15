import type { ScoreCalculator } from '../calculator';
import { ANY_V4_CALCULATOR_SOURCE } from '../provenance';
import { choiceItem } from './items';

/**
 * Porte do `apacheII` do ANY ("simplificado"): as faixas de cada variável e
 * os pontos são os de lá, mesmo onde divergem da tabela original de Knaus
 * (vários pares de faixas simétricas foram fundidos com o ponto do lado mais
 * grave; a lista está no arquivo de achados, CC-310). O aviso de versão é
 * exigência do CC-307; o texto é provisório até o Dr. Gustavo definir o final.
 */
export const APACHE_II: ScoreCalculator = {
  kind: 'score',
  id: 'apache-ii',
  name: 'APACHE II',
  aliases: ['apache', 'mortalidade uti', 'gravidade', 'prognóstico uti', 'escore prognóstico'],
  category: 'Respiratório / Sepse',
  description:
    'Escore de gravidade e predição de mortalidade em UTI (12 variáveis fisiológicas + idade + doença crônica).',
  versionNotice: {
    title: 'Versão simplificada',
    text: 'Cada variável é escolhida por faixa, sem o diagnóstico de admissão. Serve como estimativa rápida de gravidade; não substitui o APACHE II completo.',
  },
  reference: {
    why: 'Padrão histórico para comparar gravidade entre UTIs e em ensaios clínicos.',
    whenToUse: 'Primeiras 24 h de internação em UTI, para estimar gravidade e mortalidade.',
    pearlsPitfalls: [
      'Usar os piores valores das primeiras 24 h de UTI.',
      'Escore total: APS (0–60) + pontos por idade (0–6) + pontos por doença crônica (0–5).',
      'APACHE II 0–4: ~4% de mortalidade. APACHE II ≥ 35: ~88% de mortalidade.',
      'Limitação: não inclui o diagnóstico de admissão (APACHE III e IV incluem).',
      'Versão simplificada: aqui usamos os parâmetros mais impactantes para uma estimativa rápida.',
    ],
    citation:
      'Knaus WA et al. APACHE II: a severity of disease classification system. Crit Care Med. 1985;13(10):818-29.',
  },
  provenance: {
    source: ANY_V4_CALCULATOR_SOURCE,
    version: '1.0.0',
    updatedAt: '2026-10-15',
    review: { status: 'pendente' },
  },
  items: [
    choiceItem('temp', 'Temperatura retal (graus Celsius) — pior valor em 24 h', [
      ['0', '36–38,4', 0],
      ['1', '38,5–38,9 ou 34–35,9', 1],
      ['3', '39–40,9 ou 32–33,9', 3],
      ['4', '≥ 41 ou ≤ 31,9', 4],
    ]),
    choiceItem('pam_val', 'PAM (mmHg) — pior valor em 24 h', [
      ['0', '70–109', 0],
      ['2', '110–129 ou 50–69', 2],
      ['3', '130–159', 3],
      ['4', '≥ 160 ou ≤ 49', 4],
    ]),
    choiceItem('hr_val', 'Frequência cardíaca — pior valor em 24 h', [
      ['0', '70–109', 0],
      ['2', '110–139 ou 55–69', 2],
      ['3', '140–179 ou 40–54', 3],
      ['4', '≥ 180 ou ≤ 39', 4],
    ]),
    choiceItem('rr_val', 'Frequência respiratória — pior valor em 24 h', [
      ['0', '12–24', 0],
      ['1', '25–34 ou 10–11', 1],
      ['3', '35–49 ou 6–9', 3],
      ['4', '≥ 50 ou ≤ 5', 4],
    ]),
    choiceItem('oxy', 'Oxigenação — gradiente A-a se FiO2 ≥ 0,5; PaO2 se FiO2 < 0,5', [
      ['pao2-gt70', 'FiO2 < 0,5 — PaO2 > 70 mmHg', 0],
      ['pao2-61-70', 'FiO2 < 0,5 — PaO2 61–70 mmHg', 1],
      ['pao2-55-60', 'FiO2 < 0,5 — PaO2 55–60 mmHg', 3],
      ['pao2-lt55', 'FiO2 < 0,5 — PaO2 < 55 mmHg', 4],
      ['aa-lt200', 'FiO2 ≥ 0,5 — gradiente A-a < 200', 0],
      ['aa-200-349', 'FiO2 ≥ 0,5 — gradiente A-a 200–349', 2],
      ['aa-350-499', 'FiO2 ≥ 0,5 — gradiente A-a 350–499', 3],
      ['aa-gte500', 'FiO2 ≥ 0,5 — gradiente A-a ≥ 500', 4],
    ]),
    choiceItem('ph', 'pH arterial — pior valor em 24 h', [
      ['0', '7,33–7,49', 0],
      ['1', '7,50–7,59 ou 7,25–7,32', 1],
      ['3', '7,60–7,69 ou 7,15–7,24', 3],
      ['4', '≥ 7,70 ou < 7,15', 4],
    ]),
    choiceItem('na_val', 'Sódio sérico (mEq/L) — pior valor em 24 h', [
      ['0', '130–149', 0],
      ['2', '150–154 ou 120–129', 2],
      ['3', '155–159 ou 111–119', 3],
      ['4', '≥ 160 ou ≤ 110', 4],
    ]),
    choiceItem('k_val', 'Potássio sérico (mEq/L) — pior valor em 24 h', [
      ['0', '3,5–5,4', 0],
      ['1', '5,5–5,9 ou 3,0–3,4', 1],
      ['3', '6,0–6,9 ou 2,5–2,9', 3],
      ['4', '≥ 7,0 ou < 2,5', 4],
    ]),
    choiceItem(
      'cr_val',
      'Creatinina (mg/dL) — pior valor em 24 h. Pontos dobram na insuficiência renal aguda',
      [
        ['0', '0,6–1,4', 0],
        ['sem-ira-2', '1,5–1,9 ou < 0,6 — sem IRA', 2],
        ['sem-ira-3', '2,0–3,4 — sem IRA', 3],
        ['sem-ira-4', '≥ 3,5 — sem IRA', 4],
        ['com-ira-4', '1,5–1,9 ou < 0,6 — com IRA', 4],
        ['com-ira-6', '2,0–3,4 — com IRA', 6],
        ['com-ira-8', '≥ 3,5 — com IRA', 8],
      ],
    ),
    choiceItem('ht_val', 'Hematócrito (%) — pior valor em 24 h', [
      ['0', '30–45,9', 0],
      ['2', '46–49,9 ou 20–29,9', 2],
      ['4', '≥ 50 ou < 20', 4],
    ]),
    choiceItem('wbc_val', 'Leucócitos (x1000/mm³) — pior valor em 24 h', [
      ['0', '3–14,9', 0],
      ['2', '15–19,9 ou 1–2,9', 2],
      ['3', '20–39,9', 3],
      ['4', '≥ 40 ou < 1', 4],
    ]),
    choiceItem('gcs_val', 'Glasgow (GCS) — pior valor em 24 h. Pontos = 15 menos o GCS', [
      ['15', 'GCS 15', 0],
      ['14', 'GCS 14', 1],
      ['13', 'GCS 13', 2],
      ['12', 'GCS 12', 3],
      ['11', 'GCS 11', 4],
      ['10', 'GCS 10', 5],
      ['9', 'GCS 9', 6],
      ['8', 'GCS 8', 7],
      ['7', 'GCS 7', 8],
      ['6', 'GCS 6', 9],
      ['5', 'GCS 5', 10],
      ['4', 'GCS 4', 11],
      ['3', 'GCS 3', 12],
    ]),
    choiceItem('age_pts', 'Idade', [
      ['lt45', '< 45 anos', 0],
      ['45-54', '45–54 anos', 2],
      ['55-64', '55–64 anos', 3],
      ['65-74', '65–74 anos', 5],
      ['gte75', '≥ 75 anos', 6],
    ]),
    choiceItem(
      'chronic',
      'Doença crônica (imunossupressão, cirrose, ICC NYHA IV, DPOC grave, diálise)',
      [
        ['nenhuma', 'Nenhuma', 0],
        ['eletivo', 'Pós-operatório eletivo', 2],
        ['urgencia', 'Pós-operatório de emergência ou não cirúrgico', 5],
      ],
    ),
  ],
  interpretation: {
    bands: [
      {
        id: '0-4',
        upTo: { value: 4, inclusive: true },
        label: 'APACHE II 0–4',
        tone: 'neutral',
        action: 'Mortalidade estimada ~4%. Bom prognóstico.',
      },
      {
        id: '5-9',
        upTo: { value: 9, inclusive: true },
        label: 'APACHE II 5–9',
        tone: 'neutral',
        action: 'Mortalidade estimada ~8%.',
      },
      {
        id: '10-14',
        upTo: { value: 14, inclusive: true },
        label: 'APACHE II 10–14',
        tone: 'attention',
        action: 'Mortalidade estimada ~15%.',
      },
      {
        id: '15-19',
        upTo: { value: 19, inclusive: true },
        label: 'APACHE II 15–19',
        tone: 'attention',
        action: 'Mortalidade estimada ~25%.',
      },
      {
        id: '20-24',
        upTo: { value: 24, inclusive: true },
        label: 'APACHE II 20–24',
        tone: 'critical',
        action: 'Mortalidade estimada ~40%.',
      },
      {
        id: '25-29',
        upTo: { value: 29, inclusive: true },
        label: 'APACHE II 25–29',
        tone: 'critical',
        action: 'Mortalidade estimada ~55%.',
      },
      {
        id: '30-34',
        upTo: { value: 34, inclusive: true },
        label: 'APACHE II 30–34',
        tone: 'critical',
        action: 'Mortalidade estimada ~73%.',
      },
    ],
    otherwise: {
      id: 'gte35',
      label: 'APACHE II ≥ 35',
      tone: 'critical',
      action:
        'Mortalidade estimada ~85–88%. Prognóstico muito reservado. Considere discutir cuidados paliativos.',
    },
  },
};
