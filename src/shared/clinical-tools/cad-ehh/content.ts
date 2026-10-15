/**
 * Conteúdo clínico do roteiro de CAD e EHH (CC-326), portado do `ketoData.ts`
 * do KetoPath do ANY App v4 (revisão 95c8fba). O ANY diz que tudo vem da spec
 * `ketopath-spec.md` v1.0.0, validada pelo Gustavo — a spec não está no
 * repositório do ANY (achado em docs/ferramentas/revisao-clinica/cad-ehh.md).
 *
 * Os textos ficam como lá, com a marca de fonte no fim ([ADA], [UTD], [JBDS],
 * [LIT: …]); a tela tira a marca (`stripSourceTags`) e lista as fontes nas
 * referências, como o ANY. As únicas mudanças são as da regra de linguagem
 * (ordem de conduta vira sugestão), listadas no teste de conteúdo
 * (`tests/clinical-tools/cad-ehh-content.spec.ts`) e nos achados.
 *
 * Fontes e a hierarquia entre elas (decisão da spec do ANY): onde [ADA] e
 * [UTD] divergem, prevalece [UTD]; onde o UpToDate é silente, usa-se [ADA].
 *
 * Constante marcada "fora das telas do ANY" existe no `ketoData.ts`, mas
 * nenhuma tela alcançável do KetoPath a mostra: fica aqui para a revisão
 * clínica decidir, e a tela do Copiloto também não mostra.
 */

export type CadEhhTrack = 'cad' | 'ehh' | 'misto';
export type DkaSeverity = 'leve' | 'moderada' | 'grave';
export type Ketonuria = '0' | '1+' | '2+' | '3+' | '4+';
export type Consciousness = 'alerta' | 'sonolento' | 'estupor-coma';

/** Rodapé obrigatório em qualquer tela que exiba potássio ou bicarbonato. */
export const UNITS_NOTE =
  'Para íons monovalentes como potássio e bicarbonato, 1 mEq/L equivale a 1 mmol/L. [UTD]';

// ---- 1. Reconhecimento ----

export const WHEN_TO_SUSPECT = [
  'Sintomas comuns às duas condições: poliúria, polidipsia, perda de peso, vômitos, desidratação e alteração do estado cognitivo. [ADA]',
  'Na CAD, o intervalo entre os primeiros sintomas e a apresentação aguda costuma ser de horas a poucos dias. No EHH, pode levar dias a semanas. [ADA]',
  'Respiração de Kussmaul — inspirações profundas, com hálito cetônico — reflete a compensação respiratória da acidose metabólica. [ADA]',
  'Náusea, vômito e dor abdominal aparecem em mais da metade dos casos de CAD, mas são incomuns no EHH. [ADA]',
] as const;

export const ABDOMINAL_PAIN_ALERT =
  'Atenção à dor abdominal. Pode ser consequência da própria CAD ou sinal de uma causa precipitante. Se não melhorar com a correção da desidratação e da acidose, considere investigação adicional. [ADA]';

export const EUGLYCEMIC_DKA = [
  'Glicemia normal não descarta CAD.',
  'Cerca de 10% dos casos de CAD se apresentam com glicemia abaixo de 200 mg/dL. [ADA]',
  'Situações associadas: uso de inibidores de SGLT2, gestação, jejum prolongado, redução da ingesta alimentar, uso de álcool, insuficiência hepática e aplicação prévia de insulina. [ADA]',
  'Em uma série de pacientes em uso de inibidores de SGLT2 que apresentaram CAD, 35% tinham glicemia abaixo de 200 mg/dL. Em outra, 71% tinham glicemia igual ou inferior a 250 mg/dL. [ADA]',
] as const;

/** Critérios D-K-A. Os três componentes precisam estar presentes. [ADA] */
export const DKA_CRITERIA = [
  {
    axis: 'D — diabetes ou hiperglicemia',
    criterion: 'Glicemia ≥200 mg/dL ou história prévia de diabetes, independentemente da glicemia',
  },
  {
    axis: 'K — cetose',
    criterion: 'Cetonúria ≥2+ ou BHB ≥3,0 mmol/L (BHB indisponível neste serviço)',
  },
  { axis: 'A — acidose', criterion: 'pH venoso <7,3 e bicarbonato <18 mEq/L [UTD]' },
] as const;

export const DKA_CRITERIA_NOTE =
  '[ADA] aceita pH <7,30 ou bicarbonato <18. O KetoPath segue [UTD], conforme a hierarquia de fontes.';

export const BLOOD_GAS_NOTE =
  'A gasometria venosa é suficiente para a avaliação ácido-base. Não é necessária amostra arterial. [JBDS]';

export const KETONURIA_DISCORDANCE = [
  'A cetonúria pode enganar nas duas direções.',
  'O teste com nitroprussiato detecta acetoacetato, não beta-hidroxibutirato — que é o principal cetoácido produzido na CAD. [ADA]',
  'No início do quadro, a cetonúria SUBESTIMA a gravidade, porque a formação de acetoacetato é mais lenta. Uma cetonúria fraca não descarta CAD. [ADA]',
  'Na fase tardia, SUPERESTIMA: conforme a acidose melhora, o beta-hidroxibutirato é convertido em acetoacetato, e a cetonúria pode piorar enquanto o paciente melhora. Por isso a cetonúria não deve ser usada como critério de resolução. [ADA]',
  'Captopril e valproato podem gerar falso-positivo no teste de nitroprussiato. [ADA]',
] as const;

export const DKA_HHS_OVERLAP = [
  'A sobreposição entre CAD e EHH aparece em mais de um terço dos casos de crise hiperglicêmica. [ADA]',
  'Em um estudo americano, 38% das internações por crise hiperglicêmica foram por CAD, 35% por EHH e 27% por quadro misto. [ADA]',
  'A mortalidade hospitalar é maior no quadro misto: 8%, contra 5% no EHH e 3% na CAD. [ADA]',
] as const;

/**
 * Critérios do EHH — referência de consulta, não classificação automática.
 * Valores de [JBDS] validados pelo Gustavo (segundo o ANY). "Sem cetonemia
 * significativa" não é computável sem BHB: a trilha é escolha manual.
 */
export const HHS_CRITERIA = [
  'Glicemia ≥540 mg/dL (30 mmol/L)',
  'Osmolaridade ≥320 mOsm/kg',
  'Sem cetonemia significativa',
  'pH >7,3 e bicarbonato ≥15 mEq/L',
] as const;

export const HHS_NOTE =
  'Embora a maioria dos pacientes com EHH tenha pH ≥7,30 e bicarbonato ≥18 mEq/L na admissão, pode haver cetonemia leve. [ADA]';

export const SEVERITY_NOTE =
  'Nem todas as variáveis precisam estar presentes para definir a gravidade. O local de internação e o nível de cuidado são, em última análise, decisão clínica. [ADA]';

export const DIFFERENTIAL_DIAGNOSIS = [
  'Cetose de jejum — sugerida por ingesta alimentar abaixo de 500 kcal/dia, que reduz a concentração de insulina e leva à produção de cetonas. [ADA]',
  'Cetoacidose alcoólica — pessoas com uso crônico de etanol e episódio recente de ingesta intensa, seguido de vômitos e jejum, podem desenvolver cetoacidose com ou sem hiperglicemia. [ADA]',
  'Cetose da gestação e hiperêmese — os vômitos elevam os hormônios contrarregulatórios e predispõem à formação de cetonas. [ADA]',
] as const;

// ---- 2. Exames iniciais ----

/** Espelha a cadência de exames (seção 5.1 da spec), por decisão do Gustavo. */
export const INITIAL_PANEL = [
  'Glicemia',
  'Eletrólitos séricos — sódio, potássio, cloro e bicarbonato',
  'Ureia, creatinina e fósforo',
  'Gasometria venosa',
  'Hemograma completo',
  'Cetonas — sangue ou urina',
  'Eletrocardiograma',
] as const;

export const INITIAL_PANEL_NOTE =
  'Mesmo conjunto acompanhado depois, na cadência de exames. O fósforo tem seção própria no manejo.';

export const ECG_NOTE =
  'Permite avaliar alterações de repolarização de origem bioquímica, como ondas T apiculadas na hipercalemia, e sinais de isquemia. [ADA]';

export const VOLEMIA_ASSESSMENT = [
  'Taquicardia e hipotensão sugerem hipovolemia grave.',
  'Atenção: alguns pacientes mantêm estabilidade hemodinâmica apesar da depleção, porque a hipertonicidade da hiperglicemia desloca água do intracelular para o extracelular. [ADA]',
] as const;

export const SUSPICION_DRIVEN_TESTS = [
  { test: 'Culturas e radiografia de tórax', trigger: 'Suspeita de infecção' },
  { test: 'Troponina', trigger: 'Suspeita de isquemia miocárdica' },
  { test: 'Amilase e lipase', trigger: 'Dor abdominal persistente' },
  { test: 'Enzimas hepáticas', trigger: 'Suspeita de hepatopatia' },
  { test: 'Beta-hCG', trigger: 'Mulheres em idade fértil' },
] as const;

// ---- 3. Calculadoras ----

export const ANION_GAP_NOTE =
  'O ânion-gap não é recomendado como critério diagnóstico ou de resolução de primeira linha, porque pode ser distorcido pela acidose hiperclorêmica que surge com grandes volumes de salina. Mantém utilidade em cenários onde a dosagem de cetonas não está disponível. [ADA]';

export const CORRECTED_SODIUM_NOTE =
  'Fonte: UpToDate (fator 2,0). O consenso ADA 2024 utiliza fator 1,6. O KetoPath adota o fator 2,0 por coerência com o corte de 135 mEq/L usado na decisão de tonicidade, que vem da mesma fonte.';

export const FREE_WATER_DEFICIT_NOTE =
  'O déficit calculado é uma estimativa para orientar o planejamento. A reposição deve ser guiada pela resposta clínica e pela velocidade de queda da osmolaridade.';

// ---- 4. Manejo: fluidos ----

export const INITIAL_FLUID = [
  'Considere iniciar cristaloide isotônico — salina 0,9% ou cristaloide balanceado — a 1 L por hora. [UTD]',
  'Avalie a causa precipitante em paralelo. [UTD]',
] as const;

export const FLUID_PREFERENCE =
  'Preferência do KetoPath: Ringer lactato. Salina 0,9% é alternativa plenamente aceitável.';

export type VolemicStateId = 'grave' | 'leve' | 'cardiogenico';

/** Fase A — estratificação pelo estado volêmico. [UTD] */
export const VOLEMIC_STATES: readonly {
  id: VolemicStateId;
  label: string;
  conduct: string;
  /** Na hipovolemia leve, o cenário da CAD euglicêmica: a dextrose entra na largada. */
  extra: string | null;
}[] = [
  {
    id: 'grave',
    label: 'Hipovolemia grave, sem choque',
    conduct:
      'Salina 0,9% ou cristaloide balanceado, aproximadamente 1 L/h, com ritmo ajustado pela avaliação clínica',
    extra: null,
  },
  {
    id: 'leve',
    label: 'Hipovolemia leve',
    conduct: 'Salina 0,9% ou cristaloide balanceado, ritmo definido pela avaliação clínica',
    extra:
      'Se a glicemia inicial já estiver abaixo de 250 mg/dL, considere acrescentar dextrose a 5% ou 10% ao fluido desde o início do tratamento. [UTD]',
  },
  {
    id: 'cardiogenico',
    label: 'Choque cardiogênico',
    conduct: 'Monitorização hemodinâmica e vasopressor',
    extra: null,
  },
];

export const OVERLOAD_ALERT =
  'Cautela na reposição rápida em pessoas com risco de sobrecarga: idosos, gestantes e pacientes com doença cardíaca ou renal. Nesses casos, considere bolus menores, de 250 mL, com reavaliação hemodinâmica frequente. [ADA]';

export const POST_EXPANSION_REASSESSMENT = [
  'Reavalie o estado volêmico e de hidratação.',
  'A correção do déficit de volume pode ser planejada para as primeiras 24 horas. [UTD]',
  'Corrigido o déficit, o fluido subsequente pode ser ajustado pelo sódio sérico. [UTD]',
] as const;

/** Fase B — manutenção governada pelo sódio corrigido (corte em 135 mEq/L). [UTD] */
export const MAINTENANCE_FLUID = {
  below135: 'Salina 0,9% (isotônica), 250–500 mL/h',
  atOrAbove135: 'Salina 0,45% (meio-isotônica), 250–500 mL/h — para ofertar água livre',
} as const;

export const DEXTROSE_TRIGGER = [
  'Quando a glicemia cair abaixo de 250 mg/dL, considere mudar para dextrose a 5% ou 10% com salina a 0,45%, a 150–250 mL/h. [UTD]',
  'Isso previne hipoglicemia e permite manter a insulina até a correção da cetoacidose. [ADA]',
] as const;

export const DEXTROSE_VEHICLE_NOTE =
  'No algoritmo do UpToDate, a partir deste ponto o veículo passa a ser a salina a 0,45%, independentemente do que vinha sendo usado.';

export const HHS_SPEEDS = [
  'No EHH, a hiperglicemia costuma se resolver em 8 a 10 horas. [ADA]',
] as const;

export const HHS_LIMITS = [
  'Queda da glicemia: não exceder 90–120 mg/dL por hora',
  'Queda do sódio sérico: não exceder 10 mEq/L em 24 horas',
  'Queda da osmolaridade: manter entre 3,0 e 8,0 mOsm/kg por hora',
] as const;

export const HHS_SODIUM_ALERT =
  'A reposição inicial reduz glicemia e osmolaridade, deslocando água para o intracelular — o que pode elevar o sódio sérico. Uma redução de 100 mg/dL na glicemia eleva o sódio em cerca de 1,6 mEq/L. Essa elevação inicial é esperada. [ADA]';

export const HHS_VOLUME_DEFICIT = [
  'As perdas de fluido no EHH são estimadas entre 100 e 220 mL/kg. [JBDS]',
  'Cautela em idosos. A estimativa orienta o planejamento; a reposição deve ser guiada pela resposta clínica e pela velocidade de queda da osmolaridade.',
] as const;

// ---- 4.2 Potássio (libera a insulina) ----

export const POTASSIUM_INTRO = [
  'A depleção corporal total de potássio na CAD é de 3 a 6 mmol/kg, por diurese osmótica prolongada, vômitos e hiperaldosteronismo. Mesmo assim, a maioria dos pacientes chega com potássio sérico normal ou elevado, porque a acidose e a deficiência de insulina deslocam o potássio para o extracelular. [ADA]',
  'A insulina, a correção da acidose, a expansão volêmica e o aumento da caliurese fazem o potássio cair. Nas primeiras 48 horas, a queda típica é de 1 a 2 mEq/L. [ADA]',
] as const;

/** Antes da tabela de condutas. */
export const RENAL_FUNCTION_GATE =
  'Confirme função renal adequada antes de repor potássio: débito urinário de aproximadamente 50 mL/h ou mais. [UTD]';

export type PotassiumBandId = 'baixo' | 'alvo' | 'alto';

/**
 * Conduta por faixa. [UTD] Limites: < 3,5 baixo; 3,5 a 5,0 (inclusive) alvo;
 * > 5,0 alto (`potassiumBand`). As três condutas eram ordens no ANY ("Adiar a
 * insulina. Repor…") e viraram sugestão, com as mesmas doses.
 */
export const POTASSIUM_BANDS: readonly { id: PotassiumBandId; range: string; conduct: string }[] = [
  {
    id: 'baixo',
    range: '<3,5 mEq/L',
    conduct:
      'Considere adiar a insulina e repor 10 a 20 mEq de KCl por hora até o potássio ultrapassar 3,5 mEq/L',
  },
  {
    id: 'alvo',
    range: '3,5 a 5,0 mEq/L',
    conduct:
      'Considere adicionar 10 a 20 mEq de KCl a cada litro de fluido, mantendo o potássio entre 4 e 5 mEq/L',
  },
  {
    id: 'alto',
    range: '>5,0 mEq/L',
    conduct: 'Considere não repor e dosar o potássio a cada 2 horas',
  },
];

export const LOW_POTASSIUM_ALERT = [
  'Potássio baixo ou no limite inferior está presente na admissão em 5 a 10% dos casos de CAD. Iniciar insulina nessa situação pode levar a arritmia com risco de vida e fraqueza da musculatura respiratória. [ADA]',
  'Hipocalemia grave, igual ou abaixo de 2,5 mEq/L, durante o tratamento da CAD e do EHH foi associada a aumento de três vezes na mortalidade. [ADA]',
] as const;

export const POTASSIUM_MONITORING = [
  'Considere dosar o potássio 2 horas após o início da insulina e, depois, a cada 2 a 4 horas até a estabilização. [UTD]',
  'Com potássio acima de 5,0 mEq/L, dose a cada 2 horas antes de iniciar reposição. [UTD]',
] as const;

export type KclPresentationId = '10' | '19.1';

/** Apresentações disponíveis no serviço; mEq por ampola de 10 mL. */
export const KCL_PRESENTATIONS: readonly {
  id: KclPresentationId;
  label: string;
  description: string;
  mEqPerAmpoule: number;
  mlPerAmpoule: number;
}[] = [
  {
    id: '10',
    label: 'KCl 10%',
    description: '1 g → ~13,4 mEq',
    mEqPerAmpoule: 13.4,
    mlPerAmpoule: 10,
  },
  {
    id: '19.1',
    label: 'KCl 19,1%',
    description: '1,91 g → ~25,6 mEq',
    mEqPerAmpoule: 25.6,
    mlPerAmpoule: 10,
  },
];

export type KclRouteId = 'periferica' | 'central';

/** Limites de concentração — norma institucional. */
export const KCL_ROUTES: readonly { id: KclRouteId; label: string; maxMEqPerLiter: number }[] = [
  { id: 'periferica', label: 'Acesso periférico', maxMEqPerLiter: 50 },
  { id: 'central', label: 'Acesso venoso central', maxMEqPerLiter: 100 },
];

export const KCL_SPEED = [
  'Na hipocalemia com potássio abaixo de 3,5 mEq/L, a reposição sugerida é de 10 a 20 mEq por hora, até que o potássio ultrapasse 3,5 mEq/L. [UTD]',
  'A reposição a velocidades acima de 20 a 30 mEq/h raramente é necessária. [UTD]',
] as const;

export const KCL_MONITORING =
  'Bomba de infusão e monitorização contínua para todos os pacientes em CAD (norma institucional).';

/** Aparece quando a velocidade de reposição passa de 20 mEq/h. */
export const KCL_OSMOTIC_EFFECT = [
  'Sais de potássio têm efeito osmótico equivalente aos sais de sódio. Adicionar potássio a um fluido isotônico gera uma solução hipertônica. [UTD]',
  'Quando a reposição de potássio for alta, considere adicionar o cloreto de potássio à salina meio-isotônica (0,45%) em vez da isotônica (0,9%). [UTD]',
] as const;

// ---- 4.3 Insulina (travada até o potássio ser informado) ----

/**
 * Bloqueio ativo com K < 3,5. A spec citava [ADA] com "10 mmol/h"; o Gustavo
 * alinhou em mEq/h pela tabela [UTD] (segundo o comentário do ANY).
 */
export const INSULIN_BLOCKED =
  'Potássio abaixo de 3,5 mEq/L. Considere adiar a insulina até que o potássio ultrapasse 3,5 mEq/L, repondo a 10 a 20 mEq/h. [UTD]';

export const INSULIN_GATE_EMPTY = 'Informe o potássio para liberar esta seção';

export const INSULIN_PREPARATION =
  'Preparo padrão: 100 unidades de insulina regular em 100 mL de salina 0,9%, resultando em 1 U/mL.';

export const INSULIN_PRIMING = [
  'Antes de conectar ao paciente, considere desprezar 20 mL da solução pelo equipo.',
  'A insulina adsorve ao plástico do equipo. Sem purga, a dose entregue fica cerca de 16% abaixo do previsto. Após 20 mL de purga, a concentração se torna indistinguível do valor máximo — purgar mais do que isso é desperdício. [LIT: Goldberg PA et al., Diabetes Technol Ther 2006]',
  'Não é necessário aguardar tempo de repouso. Após a purga, a infusão pode ser iniciada imediatamente. [LIT: Thompson CD et al., Diabetes Technol Ther 2012]',
] as const;

export const INSULIN_PRIMING_NOTE =
  'Na diluição de 1 U/mL, os 20 mL de purga correspondem a 20 unidades.';

/** Velocidade por situação. A última linha era ordem no ANY ("Reduzir para…"). */
export const INSULIN_DOSES = [
  { situation: 'CAD', speed: '0,1 U/kg/h, sem bolus', rate: 0.1 },
  { situation: 'EHH sem cetose significativa', speed: '0,05 U/kg/h', rate: 0.05 },
  { situation: 'Misto CAD-EHH', speed: '0,1 U/kg/h', rate: 0.1 },
  {
    situation: 'Após glicemia <250 mg/dL',
    speed: 'Considere reduzir para 0,05 U/kg/h',
    rate: 0.05,
  },
] as const;

/** As duas velocidades da calculadora de insulina, na ordem do ANY. */
export const INSULIN_RATES = [0.1, 0.05] as const;
export type InsulinRate = (typeof INSULIN_RATES)[number];

export const INSULIN_TEXTS = [
  'A insulina de ação curta por infusão intravenosa contínua é a via preferida. Considere infusão de taxa fixa a 0,1 U/kg/h. [UTD]',
  'Insulina regular e análogos de ação rápida são igualmente eficazes por via intravenosa no tratamento da CAD. A insulina regular costuma ser preferida pela disponibilidade semelhante e custo bem menor. [UTD]',
  'Se o início da infusão for retardado — por dificuldade de acesso venoso, por exemplo — pode ser considerado um bolus de insulina regular de 0,1 U/kg, por via intravenosa ou intramuscular, seguido da infusão contínua. [UTD]',
] as const;

export const INSULIN_TEXTS_HHS = [
  'No EHH sem cetose significativa e sem acidose, considere infusão de taxa fixa a 0,05 U/kg/h. Se houver cetonemia significativa — o que caracteriza quadro misto CAD-EHH — considere 0,1 U/kg/h. [ADA]',
  'Alguns autores recomendam adiar a insulina até que a glicemia pare de cair apenas com a reposição volêmica, para evitar queda rápida da osmolaridade. [ADA]',
] as const;

export const INSULIN_AFTER_REDUCTION =
  'Após a redução, a infusão pode ser ajustada para manter a glicemia em torno de 200 mg/dL, e mantida até a resolução da cetoacidose. [ADA]';

export const INSULIN_PUMP_RUNNING = [
  'HGT a cada 1 hora enquanto a bomba de insulina estiver rodando.',
  'Confira também a vazão programada e o volume já infundido a cada verificação. Bombas param — por oclusão, bolsa vazia ou alarme silenciado — e a interrupção pode passar despercebida entre uma checagem e outra.',
] as const;

export const BASAL_INSULIN = [
  'Em pessoas que já usavam insulina basal ou basal-bolus antes da admissão, o esquema pode ser mantido na dose habitual, com ajustes conforme necessário. [ADA]',
  'Vários estudos relatam que a administração conjunta de dose baixa de insulina basal — 0,15 a 0,3 U/kg — durante a infusão reduz o tempo até a resolução da CAD, a duração da infusão e o tempo de internação, além de prevenir hiperglicemia de rebote, sem aumento do risco de hipoglicemia. [ADA]',
  'A prática é adotada por muitos e evitada por outros, pelo receio de hipoglicemia ou hipocalemia. [ADA]',
] as const;

// ---- 4.4 Bicarbonato / 4.5 Fosfato ----

/** Fora das telas do ANY: só o `PassoAdjuvantes`, que nenhuma tela usa, mostra. */
export const BICARBONATE_PH_HIGH = [
  'A administração rotineira de bicarbonato geralmente não é recomendada. A reposição volêmica e a insulina costumam ser suficientes para resolver a acidose metabólica da CAD. [ADA]',
  'Estudos observacionais e randomizados não mostraram vantagem do bicarbonato em desfechos cardíacos, neurológicos ou na velocidade de recuperação da hiperglicemia e da cetoacidose. [ADA]',
  'Efeitos potencialmente deletérios relatados: aumento do risco de hipocalemia, redução da captação tecidual de oxigênio, edema cerebral e acidose paradoxal do sistema nervoso central. [ADA]',
] as const;

/** Fora das telas do ANY (ver `BICARBONATE_PH_HIGH`). */
export const BICARBONATE_PH_LOW = [
  'Como a acidose metabólica grave pode ter efeitos vasculares adversos, o bicarbonato pode ser considerado quando o pH está abaixo de 7,0. [ADA]',
  'Preparo: diluir 100 mEq de bicarbonato de sódio em 400 mL de água estéril, infundindo ao longo de 2 horas. [UTD]',
  'A administração pode ser repetida a cada 2 horas até que o pH ultrapasse 7,0. [UTD]',
] as const;

/** Fora das telas do ANY. Lá seria destaque com pH < 7,0 e potássio < 5,0. */
export const BICARBONATE_KCL_LINE =
  'Se o potássio sérico estiver abaixo de 5,0 mEq/L, considere acrescentar 20 mEq de cloreto de potássio à solução. [UTD]';

export const PHOSPHATE = [
  'Na CAD há deslocamento de fosfato do intracelular para o extracelular, com perda urinária excessiva, levando à hipofosfatemia. As perdas corporais podem chegar a 1,0 mmol/kg. [ADA]',
  'A administração rotineira de fosfato geralmente não é indicada. Vários estudos randomizados prospectivos não demonstraram efeito benéfico da reposição sobre o desfecho clínico da CAD. [ADA]',
  'A reposição pode ser considerada quando houver evidência de fraqueza muscular, como comprometimento respiratório ou cardíaco, com fosfato abaixo de 1,0 mmol/L. [ADA]',
  'Quando necessária: 20 a 30 mmol de fosfato de potássio adicionados ao fluido de reposição. [ADA]',
  'A reposição excessivamente rápida pode precipitar hipocalcemia. [ADA]',
  'Os dados sobre deficiência e reposição de fosfato no EHH são escassos; recomenda-se abordagem semelhante. [ADA]',
] as const;

// ---- 5. Monitorização e titulação ----

export const LAB_CADENCE = [
  {
    parameter: 'Glicemia capilar (HGT)',
    frequency: 'a cada 1 h enquanto a bomba estiver ativa',
  },
  {
    parameter: 'Eletrólitos, ureia, creatinina, fósforo, pH venoso, glicemia sérica',
    frequency: 'a cada 2–4 h, até estabilizar [UTD]',
  },
  { parameter: 'Potássio', frequency: '2 h após iniciar insulina, depois a cada 2–4 h [UTD]' },
  { parameter: 'Osmolaridade (apenas EHH)', frequency: 'a cada 4 h [ADA]' },
] as const;

export const BHB_UNAVAILABLE_NOTE =
  'O algoritmo do UpToDate inclui beta-hidroxibutirato a cada 2 h. Indisponível neste serviço — a monitorização opera por pH venoso, bicarbonato e ânion-gap.';

/** Fora das telas do ANY (só no `KetoMonitor`, que nenhuma tela usa). */
export const CADENCE_TEXTS = [
  'A glicemia capilar pode ser verificada com glicosímetro calibrado pela instituição. As diretrizes sugerem intervalo de 1 a 2 horas. [ADA]',
  'Neste serviço, o padrão é HGT a cada 1 hora enquanto a bomba de insulina estiver ativa.',
] as const;

/** Fora das telas do ANY. */
export const EXPECTED_RESPONSE = [
  'A infusão de insulina regular deve reduzir a glicemia em cerca de 50 a 70 mg/dL por hora. [UTD]',
  'Doses mais altas geralmente não produzem efeito hipoglicemiante mais intenso, provavelmente porque os receptores de insulina já estão saturados nas doses menores. [UTD]',
  'A queda da glicemia resulta da soma de dois efeitos: a ação da insulina e a reposição volêmica. A reposição volêmica isolada pode reduzir a glicemia em 35 a 70 mg/dL por hora. [UTD]',
] as const;

export const INSUFFICIENT_FALL_INTRO =
  'Se a glicemia não cair pelo menos 50 a 70 mg/dL em relação ao valor inicial na primeira hora: [UTD]';

export const INSUFFICIENT_FALL_STEPS = [
  'Verifique o acesso venoso e confirme que a insulina está sendo entregue.',
  'Verifique se há filtro de linha instalado no equipo — filtros podem ligar insulina.',
  'Afastadas essas possibilidades, a velocidade da infusão pode ser dobrada a cada hora, até que se obtenha queda constante dessa magnitude.',
] as const;

export const FALL_CEILING = 'A queda da glicemia não deve exceder 90 a 120 mg/dL por hora. [UTD]';

/** Fora das telas do ANY. */
export const FALL_CEILING_NOTE =
  'Este teto convive com a regra de dobrar a velocidade. Dobra-se enquanto a queda estiver abaixo de 50–70 mg/dL/h; interrompe-se a escalada ao se aproximar de 90–120 mg/dL/h.';

export const AFTER_250 = [
  'Considere acrescentar dextrose a 5% ou 10% ao fluido e reduzir a infusão para 0,05 U/kg/h. [UTD]',
  'Se possível, evite que a glicemia caia rapidamente abaixo de 200 mg/dL — a queda abrupta pode favorecer o desenvolvimento de edema cerebral. [UTD]',
  'A glicemia pode ser mantida entre 150 e 200 mg/dL até a resolução da CAD. [UTD]',
] as const;

/** Fora das telas do ANY. */
export const MAINTENANCE_TARGETS = [
  { phase: 'Glicemia >250 mg/dL', target: 'Queda de 50–70 mg/dL/h' },
  { phase: 'Glicemia <250 mg/dL', target: 'Manter entre 150 e 200 mg/dL até a resolução' },
] as const;

/** Fora das telas do ANY. */
export const DKA_CORRECTION_SPEED =
  'A reposição volêmica isolada, sem insulina, já reduz a glicemia em cerca de 50 a 70 mg/dL por hora. [ADA]';

// ---- 7. Resolução e transição ----

/** Fora das telas do ANY. */
export const DKA_RESOLUTION_ADA =
  'A resolução da CAD é definida por cetona plasmática abaixo de 0,6 mmol/L associada a pH venoso ≥7,3 ou bicarbonato ≥18 mEq/L. Idealmente, a glicemia também deve estar abaixo de 200 mg/dL. [ADA]';

/** Fora das telas do ANY. Adaptação ao serviço sem BHB. */
export const DKA_RESOLUTION_ADAPTED = [
  { criterion: 'pH venoso ≥7,3 ou bicarbonato ≥18 mEq/L', weight: 'obrigatório' },
  { criterion: 'Glicemia <200 mg/dL', weight: 'desejável' },
  { criterion: 'Ânion-gap', weight: 'apoio, não critério isolado' },
] as const;

export const DO_NOT_USE_FOR_RESOLUTION = [
  'Cetonúria não deve ser usada como critério de resolução. Conforme a acidose melhora, o beta-hidroxibutirato é convertido em acetoacetato — e o exame pode piorar enquanto o paciente melhora. [ADA]',
  'O ânion-gap não é recomendado como critério isolado, porque pode ser distorcido pela acidose metabólica hiperclorêmica causada por grandes volumes de salina 0,9%. [ADA]',
  'A acidose hiperclorêmica com ânion-gap normal é comum após o tratamento bem-sucedido da CAD e pode atrasar a transição para insulina subcutânea se for confundida com CAD persistente. [ADA]',
] as const;

export const HHS_RESOLUTION_TEXT =
  'Não há consenso formal sobre a definição de resolução do EHH. Considera-se resolvido quando a osmolaridade medida ou calculada cai abaixo de 300 mOsm/kg, a hiperglicemia foi corrigida, o débito urinário está acima de 0,5 mL/kg/h, o estado cognitivo melhorou e a glicemia está abaixo de 250 mg/dL. [ADA]';

export const HHS_RESOLUTION_CHECKLIST = [
  'Osmolaridade abaixo de 300 mOsm/kg',
  'Hiperglicemia corrigida',
  'Débito urinário acima de 0,5 mL/kg/h',
  'Estado cognitivo melhorou',
  'Glicemia abaixo de 250 mg/dL',
] as const;

export const TRANSITION_TEXTS = [
  'Após a resolução da CAD e quando o paciente estiver apto a se alimentar, considere iniciar esquema subcutâneo de múltiplas doses (basal-bolus). [UTD]',
  'A sobreposição com a infusão intravenosa depende do tipo de insulina subcutânea iniciada: [UTD]',
] as const;

export type SubcutaneousInsulinId = 'rapido' | 'curta';

export const TRANSITION_OVERLAP: readonly {
  id: SubcutaneousInsulinId;
  type: string;
  time: string;
}[] = [
  { id: 'rapido', type: 'Análogo de ação rápida', time: '1–2 h' },
  { id: 'curta', type: 'Ação curta ou longa', time: '2–4 h' },
];

export const TRANSITION_OVERLAP_NOTE =
  'A sobreposição garante nível plasmático adequado de insulina e previne recorrência de hiperglicemia ou cetoacidose. [UTD]';

/** Fora das telas do ANY: a tela mostra a conta (`subcutaneousTransition`), não a tabela. */
export const TRANSITION_TOTAL_DAILY_DOSE = [
  { situation: 'Sem uso prévio de insulina', dose: '0,5–0,6 U/kg/dia' },
  { situation: 'Risco de hipoglicemia (insuficiência renal, fragilidade)', dose: '~0,3 U/kg/dia' },
  { situation: 'Em uso prévio de insulina', dose: 'considerar o esquema prévio e a HbA1c' },
] as const;

export const TRANSITION_SPLIT_NOTE =
  'A calculadora não sugere a repartição entre basal e prandial. As fontes consultadas não especificam proporção; a divisão fica a critério clínico.';

/** Fora das telas do ANY. */
export const TRANSITION_FINAL_TEXTS = [
  'Todos os pacientes precisam de insulina basal por via subcutânea antes da suspensão da insulina intravenosa. [UTD]',
  'Pacientes com diabetes conhecido podem receber a insulina na dose que usavam antes da admissão. [ADA]',
  'Se houver preocupação com insulinização basal inadequada — por exemplo, HbA1c elevada — ou se algum fármaco precipitante contribuiu para o evento, o esquema pode ser alterado já na alta, em vez de adiar para o seguimento ambulatorial. [ADA]',
  'O esquema basal-bolus com análogos é o preferido, e foi associado a menor taxa de hipoglicemia após a transição em comparação com insulinas humanas. [ADA]',
] as const;

// ---- 8. Armadilhas ----

export const PITFALLS = [
  {
    title: 'Hipoglicemia',
    texts: [
      'Em estudos de tratamento da CAD, o risco de hipoglicemia abaixo de 70 mg/dL variou entre 16% e 28%; hipoglicemia grave, abaixo de 40 mg/dL, ocorreu em 2% dos casos. [ADA]',
      'Hipoglicemia abaixo de 40 mg/dL durante o tratamento foi associada a aumento de 4,8 vezes na mortalidade. [ADA]',
      'Mitigação: monitorização da glicemia a cada 1 a 2 horas; redução da insulina para 0,05 U/kg/h e acréscimo de dextrose quando a glicemia cair abaixo de 250 mg/dL. [ADA]',
    ],
  },
  {
    title: 'Hipocalemia',
    texts: [
      'Hipocalemia abaixo de 3,5 mEq/L ocorreu em cerca de 55% dos pacientes com CAD e 51% dos com EHH. Hipocalemia grave, abaixo de 2,5 mEq/L, em 16% dos casos de CAD e 9% dos de EHH. [ADA]',
      'Hipocalemia igual ou abaixo de 2,5 mEq/L foi associada a aumento da mortalidade hospitalar. [ADA]',
    ],
  },
  {
    title: 'Acidose hiperclorêmica',
    texts: [
      'Acidose com ânion-gap normal pode surgir na fase de recuperação da CAD, provavelmente por perda de cetoânions — que seriam metabolizados a bicarbonato — e pelo excesso de cloreto infundido durante o tratamento. [ADA]',
      'É autolimitada e com poucas consequências clínicas. Ocorre menos com soluções balanceadas e com infusão mais lenta de salina. [ADA]',
      'O risco prático é confundi-la com CAD persistente e atrasar a transição. [ADA]',
    ],
  },
  {
    title: 'Correção rápida — edema cerebral',
    texts: [
      'Edema cerebral é raro em adultos, estimado em menos de 0,1% dos eventos, mas com mortalidade relatada em torno de 30%. [ADA]',
      'Em adultos com EHH e CAD, mudanças rápidas de osmolaridade podem estar associadas ao quadro. Pode ser subclínico e visível apenas em exame de imagem. [ADA]',
      'Recomenda-se atenção a mudanças no estado mental e limiar baixo para neuroimagem. [ADA]',
    ],
  },
  {
    title: 'Síndrome de desmielinização osmótica',
    texts: [
      'Pode ocorrer com correção rápida de hiponatremia e complicar o tratamento do EHH, em que pacientes hiperosmolares podem estar relativamente hiponatrêmicos. [ADA]',
      'A queda da osmolaridade deve ficar entre 3,0 e 8,0 mOsm/kg por hora. [ADA]',
    ],
  },
  {
    title: 'Lesão renal aguda',
    texts: [
      'Cerca de 50% dos adultos admitidos com CAD e EHH apresentam lesão renal aguda. É mais comum em idosos, com osmolaridade mais alta e glicemia de admissão mais elevada. Costuma resolver com a hidratação. [ADA]',
    ],
  },
  {
    title: 'Desligar a infusão cedo demais',
    texts: [
      'Considere manter a sobreposição de 1 a 2 horas com a insulina subcutânea antes de desligar a infusão. [ADA]',
    ],
  },
] as const;

// ---- 9. Fator precipitante ----

export const PRECIPITANT_INTRO =
  'A identificação e o tratamento da causa precipitante fazem parte do manejo. [ADA]';

export const PRECIPITANTS = [
  {
    id: 'infeccao',
    label: 'Infecção',
    note: 'Causa mais comum no mundo, em 14 a 58% dos casos de CAD. No EHH, é o principal precipitante em 30 a 60%, com infecção urinária e pneumonia à frente. [ADA]',
  },
  {
    id: 'omissao',
    label: 'Omissão ou uso insuficiente de insulina',
    note: 'Causa maior, sobretudo em contexto psicossocial e socioeconômico desfavorável [ADA]',
  },
  {
    id: 'dm-recente',
    label: 'Diabetes de início recente',
    note: 'Entre 6% e 21% dos adultos abrem o diabetes tipo 1 com CAD [ADA]',
  },
  { id: 'iam', label: 'Infarto agudo do miocárdio', note: '[ADA]' },
  { id: 'avc', label: 'Acidente vascular cerebral', note: '[ADA]' },
  { id: 'pancreatite', label: 'Pancreatite aguda', note: '[ADA]' },
  { id: 'tep', label: 'Tromboembolismo pulmonar', note: '[ADA]' },
  { id: 'trauma', label: 'Trauma', note: '[ADA]' },
  { id: 'alcool', label: 'Álcool ou outras substâncias', note: '[ADA]' },
  { id: 'cirurgia', label: 'Cirurgia recente', note: '[ADA]' },
  { id: 'isglt2', label: 'Inibidor de SGLT2', note: 'Ver nota abaixo' },
  { id: 'corticoide', label: 'Corticosteroide', note: '[ADA]' },
  { id: 'antipsico', label: 'Antipsicótico', note: '[ADA]' },
  {
    id: 'checkpoint',
    label: 'Inibidor de checkpoint imunológico',
    note: '1 a 2% desenvolvem diabetes autoimune de início recente [ADA]',
  },
] as const;

export type PrecipitantId = (typeof PRECIPITANTS)[number]['id'];

/** Aparece quando o iSGLT2 é marcado. */
export const SGLT2_NOTE = [
  'Inibidores de SGLT2 geralmente são suspensos na admissão. [ADA]',
  'Na CAD euglicêmica, a dextrose a 5% ou 10% pode ser acrescentada ao fluido intravenoso ou iniciada junto com a salina 0,9%. [ADA]',
] as const;

export const MENTAL_HEALTH_SCREENING =
  'A relação entre condições de saúde mental e crises hiperglicêmicas pode ser bidirecional. Recomenda-se que todas as pessoas que apresentam crise hiperglicêmica sejam rastreadas para questões de saúde mental. [ADA]';

// ---- 10. Disposição ----

export const DISPOSITION: Readonly<Record<DkaSeverity, string>> = {
  leve: 'Unidade regular ou de observação',
  moderada: 'Unidade intermediária ou de cuidados semi-intensivos',
  grave: 'UTI',
};

/** Fora das telas do ANY. */
export const DISPOSITION_TEXTS = [
  'A maioria das pessoas com CAD leve ou moderada não complicada pode ser tratada no departamento de emergência ou em unidade intermediária, desde que haja supervisão de enfermagem e monitorização adequadas. [ADA]',
  'Comparações entre tratar CAD em UTI e em unidades intermediárias ou de internação geral não demonstraram diferença clara em mortalidade, tempo de internação ou tempo até a resolução da cetoacidose. A internação em UTI de pessoas com CAD leve foi associada a mais exames laboratoriais e custo mais alto. [ADA]',
  'Considere UTI para pessoas com CAD grave ou EHH, para aquelas cuja causa precipitante seja uma condição crítica — como infarto do miocárdio, sangramento gastrointestinal ou sepse — e para as que apresentam alteração do estado mental. [ADA]',
] as const;

/** Tabela de gravidade do passo "Classificar" (texto da tela do ANY). */
export const SEVERITY_TABLE: readonly {
  row: string;
  cells: Readonly<Record<DkaSeverity, string>>;
}[] = [
  { row: 'pH venoso', cells: { leve: '>7,25 a <7,30', moderada: '7,00–7,25', grave: '<7,00' } },
  { row: 'HCO₃', cells: { leve: '15–18', moderada: '10 a <15', grave: '<10' } },
  { row: 'Consciência', cells: { leve: 'alerta', moderada: 'sonolento', grave: 'estupor' } },
  { row: 'Cuidado', cells: { leve: 'regular', moderada: 'intermediária', grave: 'UTI' } },
];

// ---- 11. Referências ----

export const REFERENCES: readonly { text: string; url: string | null }[] = [
  {
    text: 'Umpierrez GE, Davis GM, ElSayed NA, et al. Hyperglycaemic crises in adults with diabetes: a consensus report. Diabetologia 2024;67:1455–1479.',
    url: 'https://doi.org/10.1007/s00125-024-06183-8',
  },
  {
    text: 'Dhatariya KK, Joint British Diabetes Societies for Inpatient Care. The management of diabetic ketoacidosis in adults. Diabet Med 2022;39:e14788.',
    url: 'https://doi.org/10.1111/dme.14788',
  },
  {
    text: 'Mustafa OG, Haq M, Dashora U, Castro E. Management of hyperosmolar hyperglycaemic state (HHS) in adults. Diabet Med 2023;40:e15005.',
    url: 'https://doi.org/10.1111/dme.15005',
  },
  {
    text: 'Goldberg PA, et al. "Waste not, want not": determining the optimal priming volume for intravenous insulin infusions. Diabetes Technol Ther 2006.',
    url: 'https://doi.org/10.1089/dia.2006.8.598',
  },
  {
    text: 'Thompson CD, et al. The effect of tubing dwell time on insulin adsorption during intravenous insulin infusions. Diabetes Technol Ther 2012.',
    url: null,
  },
  {
    text: 'UpToDate — Diabetic ketoacidosis in adults: Treatment; Hyperosmolar hyperglycemic state in adults: Treatment (consultado)',
    url: null,
  },
];

// ---- Painel de exames ----

export type LabFieldId =
  | 'glicemia'
  | 'sodio'
  | 'potassio'
  | 'cloro'
  | 'bicarbonato'
  | 'phVenoso'
  | 'ureia';

export interface LabField {
  id: LabFieldId;
  label: string;
  unit: string;
  min: number;
  max: number;
  required: boolean;
  /** Passo do teclado e do gerador de teste. */
  step: number;
}

/**
 * Painel de 7 exames com as faixas do ANY (`KETO_CAMPOS`). Lá a faixa não
 * barrava nada; aqui o valor fora dela é erro e não entra em conta nenhuma
 * (ADR-017). A ureia é opcional e, como no ANY, não entra em conta.
 */
export const LAB_FIELDS: readonly LabField[] = [
  { id: 'glicemia', label: 'Glicemia', unit: 'mg/dL', min: 20, max: 1500, required: true, step: 1 },
  { id: 'sodio', label: 'Sódio', unit: 'mEq/L', min: 100, max: 190, required: true, step: 1 },
  { id: 'potassio', label: 'Potássio', unit: 'mEq/L', min: 1, max: 9, required: true, step: 0.1 },
  { id: 'cloro', label: 'Cloro', unit: 'mEq/L', min: 60, max: 140, required: true, step: 1 },
  {
    id: 'bicarbonato',
    label: 'Bicarbonato',
    unit: 'mEq/L',
    min: 1,
    max: 40,
    required: true,
    step: 0.1,
  },
  { id: 'phVenoso', label: 'pH venoso', unit: '', min: 6.5, max: 7.7, required: true, step: 0.01 },
  { id: 'ureia', label: 'Ureia', unit: 'mg/dL', min: 5, max: 300, required: false, step: 1 },
];

export const KETONURIA_OPTIONS: readonly Ketonuria[] = ['0', '1+', '2+', '3+', '4+'];

export const CONSCIOUSNESS_OPTIONS: readonly { id: Consciousness; label: string }[] = [
  { id: 'alerta', label: 'Alerta' },
  { id: 'sonolento', label: 'Sonolento' },
  { id: 'estupor-coma', label: 'Estupor ou coma' },
];

export const TRACK_OPTIONS: readonly { id: CadEhhTrack; label: string }[] = [
  { id: 'cad', label: 'CAD' },
  { id: 'ehh', label: 'EHH' },
  { id: 'misto', label: 'Misto' },
];

/** Fora das telas do ANY (grade de seções da primeira versão do KetoPath). */
export const LEGACY_SECTIONS = [
  { id: 'reconhecimento', label: 'Reconhecimento' },
  { id: 'exames', label: 'Exames' },
  { id: 'calculadoras', label: 'Calculadoras' },
  { id: 'manejo', label: 'Manejo' },
  { id: 'monitorizacao', label: 'Monitorização' },
  { id: 'planilha', label: 'Planilha' },
  { id: 'resolucao', label: 'Resolução' },
  { id: 'armadilhas', label: 'Armadilhas' },
  { id: 'precipitante', label: 'Precipitante' },
  { id: 'disposicao', label: 'Disposição' },
  { id: 'referencias', label: 'Referências' },
] as const;

// ---- Planilha de acompanhamento (seção 6) ----

/** As 19 colunas da planilha impressa, na ordem do ANY, com o grupo de cada uma. */
export const WORKSHEET_COLUMNS: readonly { label: string; group: '' | string }[] = [
  { label: 'Hora', group: '' },
  { label: 'Glicemia', group: 'Laboratório' },
  { label: 'K', group: 'Laboratório' },
  { label: 'Na', group: 'Laboratório' },
  { label: 'Cl', group: 'Laboratório' },
  { label: 'HCO₃', group: 'Laboratório' },
  { label: 'pH venoso', group: 'Laboratório' },
  { label: 'Fósforo', group: 'Laboratório' },
  { label: 'Creatinina', group: 'Laboratório' },
  { label: 'PA', group: 'Clínico' },
  { label: 'FC', group: 'Clínico' },
  { label: 'Diurese (mL/h)', group: 'Clínico' },
  { label: 'Nível de consciência', group: 'Clínico' },
  { label: 'Balanço acumulado', group: 'Clínico' },
  { label: 'Insulina — vazão (mL/h)', group: 'Conduta' },
  { label: 'Insulina — volume infundido (mL)', group: 'Conduta' },
  { label: 'Fluido — tipo e volume', group: 'Conduta' },
  { label: 'KCl reposto', group: 'Conduta' },
  { label: 'Dextrose (sim/não, %)', group: 'Conduta' },
];

/** Linhas em branco da planilha, preenchidas à mão (hora a hora). */
export const WORKSHEET_ROWS = 12;
