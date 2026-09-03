/**
 * Casos reais reportados por médicos do piloto em que o Copiloto conduziu o
 * raciocínio para o cenário errado. Cada entrada vira um caso de regressão:
 * enquanto existir aqui, tem que existir cobertura correspondente na base de
 * contexto (pacote de curadoria + cenario/subtipo), e o caso deve ser rodado
 * ponta a ponta depois da ingestão aprovada.
 *
 * `wrongCenario` é para onde o Copiloto foi; `expectedCenario`/`expectedSubtipo`
 * é a cobertura que faltava. `discriminators` são os achados que a resposta
 * precisa nomear no `reasoning` para justificar o lado escolhido — é isso que
 * separa "acertou" de "acertou por sorte".
 */
export interface FieldIncidentCase {
  id: string;
  reportedOn: string;
  clinicalInput: string;
  wrongOutcome: string;
  wrongCenario: string;
  expectedCenario: string;
  expectedSubtipo?: string;
  coveredByPack: string;
  discriminators: string[];
}

export const FIELD_INCIDENT_CASES: FieldIncidentCase[] = [
  {
    id: 'fi-001-dengue-como-sepse',
    reportedOn: '2026-09-03',
    clinicalInput:
      'Adulto previamente hígido com febre alta há 4 dias, mialgia intensa, dor retro-orbitária e prostração. Procurou o PS hoje porque a febre cedeu e ele piorou, com dor abdominal contínua e um episódio de lipotímia. PA 96x64, FC 108, extremidades frias, sem foco infeccioso ao exame. Hemograma com leucócitos 3.100, plaquetas 98.000, hematócrito acima do basal.',
    wrongOutcome:
      'Copiloto conduziu como sepse (bundle de 1h, antibiótico de amplo espectro e bolus amplo), sem citar dengue em nenhum momento.',
    wrongCenario: 'sepse',
    expectedCenario: 'febre_aguda_indiferenciada',
    expectedSubtipo: 'dengue_arbovirose',
    coveredByPack: 'kb-005-arboviroses-dengue',
    discriminators: [
      'piora na defervescência entre o 3º e o 7º dia',
      'leucopenia com plaquetopenia',
      'hematócrito em ascensão',
      'ausência de foco infeccioso',
    ],
  },
  {
    id: 'fi-002-cefaleia-em-salvas-como-hemorragia',
    reportedOn: '2026-09-03',
    clinicalInput:
      'Homem de 38 anos com crises de dor periorbitária esquerda de forte intensidade, cada uma durando cerca de uma hora e cedendo sozinha, repetindo três a quatro vezes por dia há dez dias, várias delas acordando o paciente de madrugada. Durante a crise fica agitado, andando pela sala, com lacrimejamento e rinorreia do lado esquerdo. Exame neurológico normal fora da crise.',
    wrongOutcome:
      'Copiloto apontou hemorragia intracerebral, e a hipótese virou o título do atendimento e entrou no SBAR gerado.',
    wrongCenario: 'hemorragia_subaracnoidea',
    expectedCenario: 'cefaleia',
    expectedSubtipo: 'primaria',
    coveredByPack: 'kb-006-cefaleias-primarias',
    discriminators: [
      'crises autolimitadas de 15 a 180 minutos',
      'repetição estereotipada com periodicidade circadiana',
      'sinais autonômicos ipsilaterais',
      'inquietação durante a crise',
      'ausência de pico em menos de 1 minuto',
    ],
  },
];
