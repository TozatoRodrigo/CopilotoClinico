export interface Kb001SyntheticCase {
  id: string;
  cenario: string;
  clinicalInput: string;
  expectedDecision: 'recommend' | 'clarify' | 'uncertainty';
  expectedFocus: string[];
}

function makeCases(
  cenario: string,
  first: Omit<Kb001SyntheticCase, 'cenario'>,
  second: Omit<Kb001SyntheticCase, 'cenario'>,
): Kb001SyntheticCase[] {
  return [{ cenario, ...first }, { cenario, ...second }];
}

export const KB_001_SYNTHETIC_CASES: Kb001SyntheticCase[] = [
  ...makeCases(
    'sindrome_gripal_ivas',
    {
      id: 'sg-001',
      clinicalInput:
        'Paciente com síndrome gripal há 3 dias, febre, mialgia e imunossupressão não informada.',
      expectedDecision: 'clarify',
      expectedFocus: ['tempo de sintomas > 48h', 'imunossupressão', 'grupo de risco'],
    },
    {
      id: 'sg-002',
      clinicalInput: 'Paciente com síndrome gripal, SpO2 91%, dispneia e hipotensão leve.',
      expectedDecision: 'recommend',
      expectedFocus: ['SRAG', 'internação', 'oseltamivir'],
    },
  ),
  ...makeCases(
    'dor_toracica',
    {
      id: 'dt-001',
      clinicalInput: 'Dor torácica súbita há 40 minutos, sudorese, ECG ainda não realizado.',
      expectedDecision: 'clarify',
      expectedFocus: ['ECG em 10 minutos', 'supra de ST', 'instabilidade'],
    },
    {
      id: 'dt-002',
      clinicalInput: 'Dor torácica em repouso com hipotensão e dispneia importante.',
      expectedDecision: 'recommend',
      expectedFocus: ['instabilidade hemodinâmica', 'SCA', 'via rápida'],
    },
  ),
  ...makeCases(
    'dispneia_dpoc_exacerbado',
    {
      id: 'dd-001',
      clinicalInput:
        'Dispneia aguda em paciente com DPOC, sem gasometria e sem resposta documentada ao broncodilatador.',
      expectedDecision: 'clarify',
      expectedFocus: ['resposta ao tratamento inicial', 'retenção de CO2', 'gravidade'],
    },
    {
      id: 'dd-002',
      clinicalInput: 'Paciente com DPOC, sonolento, SpO2 86% e uso de musculatura acessória.',
      expectedDecision: 'recommend',
      expectedFocus: ['falência respiratória', 'suporte ventilatório', 'internação'],
    },
  ),
  ...makeCases(
    'dor_abdominal_aguda',
    {
      id: 'da-001',
      clinicalInput:
        'Dor abdominal difusa sem informação sobre localização, sangramento ou possibilidade de gestação.',
      expectedDecision: 'clarify',
      expectedFocus: ['localização', 'gravidez', 'red flags cirúrgicas'],
    },
    {
      id: 'da-002',
      clinicalInput: 'Dor abdominal intensa com defesa involuntária e hipotensão.',
      expectedDecision: 'recommend',
      expectedFocus: ['abdome agudo', 'instabilidade', 'avaliação cirúrgica'],
    },
  ),
  ...makeCases(
    'cefaleia',
    {
      id: 'cf-001',
      clinicalInput:
        'Cefaleia forte sem informação sobre início súbito, febre ou déficit focal.',
      expectedDecision: 'clarify',
      expectedFocus: ['trovoada', 'déficit focal', 'meningismo'],
    },
    {
      id: 'cf-002',
      clinicalInput: 'Cefaleia em trovoada com vômitos e déficit neurológico focal.',
      expectedDecision: 'recommend',
      expectedFocus: ['hemorragia subaracnoide', 'neuroimagem urgente', 'red flags'],
    },
  ),
  ...makeCases(
    'lombalgia',
    {
      id: 'lb-001',
      clinicalInput:
        'Lombalgia aguda sem descrição de força, sensibilidade em sela ou função urinária.',
      expectedDecision: 'clarify',
      expectedFocus: ['déficit neurológico', 'retenção urinária', 'cauda equina'],
    },
    {
      id: 'lb-002',
      clinicalInput:
        'Lombalgia com anestesia em sela, retenção urinária e déficit motor progressivo.',
      expectedDecision: 'recommend',
      expectedFocus: ['cauda equina', 'urgência neurológica', 'imagem urgente'],
    },
  ),
  ...makeCases(
    'itu_pielonefrite',
    {
      id: 'it-001',
      clinicalInput: 'Disúria e polaciúria sem informação sobre febre, dor lombar ou gestação.',
      expectedDecision: 'clarify',
      expectedFocus: ['febre', 'dor em flanco', 'gravidez'],
    },
    {
      id: 'it-002',
      clinicalInput:
        'Febre alta, dor lombar, vômitos e hipotensão em paciente com cálculo urinário conhecido.',
      expectedDecision: 'recommend',
      expectedFocus: ['pielonefrite complicada', 'obstrução', 'internação'],
    },
  ),
  ...makeCases(
    'pneumonia_comunitaria',
    {
      id: 'pc-001',
      clinicalInput: 'Suspeita de pneumonia sem saturação, FR ou estado mental informados.',
      expectedDecision: 'clarify',
      expectedFocus: ['SpO2', 'confusão', 'critério de internação'],
    },
    {
      id: 'pc-002',
      clinicalInput: 'Pneumonia com SpO2 89%, confusão e infiltrado multilobar.',
      expectedDecision: 'recommend',
      expectedFocus: ['internação', 'insuficiência respiratória', 'gravidade'],
    },
  ),
  ...makeCases(
    'celulite_erisipela',
    {
      id: 'ce-001',
      clinicalInput:
        'Celulite em membro inferior sem informação sobre abscesso, necrose ou progressão.',
      expectedDecision: 'clarify',
      expectedFocus: ['coleção', 'progressão rápida', 'dor desproporcional'],
    },
    {
      id: 'ce-002',
      clinicalInput: 'Eritema com bolhas, necrose, crepitação e hipotensão.',
      expectedDecision: 'recommend',
      expectedFocus: ['fasciíte necrosante', 'cirurgia', 'antibiótico EV'],
    },
  ),
  ...makeCases(
    'gastroenterite_desidratacao',
    {
      id: 'gd-001',
      clinicalInput:
        'Diarreia aguda sem informação sobre sangue nas fezes, diurese ou tolerância oral.',
      expectedDecision: 'clarify',
      expectedFocus: ['desidratação', 'sangramento', 'choque'],
    },
    {
      id: 'gd-002',
      clinicalInput: 'Diarreia com sangue, hipotensão e incapacidade de hidratação oral.',
      expectedDecision: 'recommend',
      expectedFocus: ['hidratação venosa', 'gravidade', 'exclusão de foco invasivo'],
    },
  ),
  ...makeCases(
    'crise_hipertensiva',
    {
      id: 'ch-001',
      clinicalInput: 'PA 220x120 sem informação sobre dor torácica, déficit focal ou dispneia.',
      expectedDecision: 'clarify',
      expectedFocus: ['lesão de órgão-alvo', 'sintoma neurológico', 'dispneia'],
    },
    {
      id: 'ch-002',
      clinicalInput: 'PA 230x130 com edema agudo de pulmão e dor torácica.',
      expectedDecision: 'recommend',
      expectedFocus: ['emergência hipertensiva', 'órgão-alvo', 'monitorização'],
    },
  ),
  ...makeCases(
    'hipoglicemia_hiperglicemia',
    {
      id: 'hg-001',
      clinicalInput:
        'Hiperglicemia importante sem cetonemia, potássio ou estado mental informados.',
      expectedDecision: 'clarify',
      expectedFocus: ['CAD/EHH', 'potássio', 'estado mental'],
    },
    {
      id: 'hg-002',
      clinicalInput:
        'Paciente rebaixado com hiperglicemia, desidratação intensa e cetose positiva.',
      expectedDecision: 'recommend',
      expectedFocus: ['CAD', 'reposições', 'monitorização'],
    },
  ),
  ...makeCases(
    'crise_convulsiva',
    {
      id: 'cc-001',
      clinicalInput:
        'Crise convulsiva sem informação se foi primeiro episódio, trauma ou retorno ao basal.',
      expectedDecision: 'clarify',
      expectedFocus: ['primeira crise', 'retorno ao basal', 'trauma'],
    },
    {
      id: 'cc-002',
      clinicalInput: 'Paciente mantém rebaixamento após convulsão, febre e rigidez de nuca.',
      expectedDecision: 'recommend',
      expectedFocus: ['infecção SNC', 'imagem/punção', 'gravidade'],
    },
  ),
  ...makeCases(
    'intoxicacao_exogena',
    {
      id: 'ie-001',
      clinicalInput: 'Paciente agitado após possível intoxicação, substância e horário desconhecidos.',
      expectedDecision: 'clarify',
      expectedFocus: ['agente', 'tempo', 'coingestão'],
    },
    {
      id: 'ie-002',
      clinicalInput: 'Rebaixamento do sensório com depressão respiratória e agente desconhecido.',
      expectedDecision: 'recommend',
      expectedFocus: ['ABC', 'suporte', 'toxicidade grave'],
    },
  ),
  ...makeCases(
    'anafilaxia_urticaria',
    {
      id: 'an-001',
      clinicalInput:
        'Urticária após alimento sem informação sobre falta de ar, hipotensão ou edema de língua.',
      expectedDecision: 'clarify',
      expectedFocus: ['comprometimento respiratório', 'hipotensão', 'anafilaxia'],
    },
    {
      id: 'an-002',
      clinicalInput: 'Exposição a alimento com estridor, edema de língua e hipotensão.',
      expectedDecision: 'recommend',
      expectedFocus: ['epinefrina IM', 'anafilaxia', 'observação'],
    },
  ),
  ...makeCases(
    'vertigem',
    {
      id: 've-001',
      clinicalInput:
        'Vertigem aguda sem informação sobre marcha, cefaleia ou déficit neurológico.',
      expectedDecision: 'clarify',
      expectedFocus: ['incapacidade de deambular', 'déficit focal', 'cefaleia intensa'],
    },
    {
      id: 've-002',
      clinicalInput: 'Vertigem contínua com incapacidade de deambular e disartria.',
      expectedDecision: 'recommend',
      expectedFocus: ['causa central', 'AVC', 'investigação urgente'],
    },
  ),
  ...makeCases(
    'febre_sem_foco_adulto',
    {
      id: 'ff-001',
      clinicalInput:
        'Febre sem foco sem informação sobre hipotensão, confusão ou imunossupressão.',
      expectedDecision: 'clarify',
      expectedFocus: ['sepse', 'imunossupressão', 'meningismo'],
    },
    {
      id: 'ff-002',
      clinicalInput: 'Febre com hipotensão, confusão e neutropenia pós-quimioterapia.',
      expectedDecision: 'recommend',
      expectedFocus: ['sepse/neutropenia febril', 'antibiótico', 'internação'],
    },
  ),
  ...makeCases(
    'tvp_tep_suspeito',
    {
      id: 'te-001',
      clinicalInput:
        'Dispneia e dor torácica sem informação sobre hipotensão, hemoptise ou edema unilateral.',
      expectedDecision: 'clarify',
      expectedFocus: ['probabilidade clínica', 'hipotensão', 'edema unilateral'],
    },
    {
      id: 'te-002',
      clinicalInput: 'Síncope, hipoxemia e hipotensão em contexto de suspeita de TEP.',
      expectedDecision: 'recommend',
      expectedFocus: ['TEP de alto risco', 'estabilização', 'anticoagulação/trombólise'],
    },
  ),
  ...makeCases(
    'colica_renal',
    {
      id: 'cr-001',
      clinicalInput: 'Dor em flanco sem informação sobre febre, diurese ou rim único.',
      expectedDecision: 'clarify',
      expectedFocus: ['obstrução complicada', 'febre', 'função renal'],
    },
    {
      id: 'cr-002',
      clinicalInput: 'Cólica renal com febre, anúria e rim único.',
      expectedDecision: 'recommend',
      expectedFocus: ['urgência urológica', 'obstrução infectada', 'descompressão'],
    },
  ),
  ...makeCases(
    'ansiedade_agitacao_ps',
    {
      id: 'aa-001',
      clinicalInput:
        'Agitação no PS sem informação sobre risco suicida, hipóxia ou uso de substâncias.',
      expectedDecision: 'clarify',
      expectedFocus: ['delirium', 'intoxicação/abstinência', 'risco suicida'],
    },
    {
      id: 'aa-002',
      clinicalInput: 'Paciente muito agitado, desatento, hipoxêmico e potencialmente violento.',
      expectedDecision: 'recommend',
      expectedFocus: ['causa clínica', 'segurança', 'monitorização'],
    },
  ),
];
