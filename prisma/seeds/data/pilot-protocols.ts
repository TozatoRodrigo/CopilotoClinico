/**
 * PROT-003: árvores de decisão dos 4 protocolos piloto (síndrome gripal,
 * sepse — bundle 1ª hora, dor torácica, AVC agudo — classificação).
 *
 * STATUS: rascunho técnico. Os grafos abaixo seguem fielmente as fontes
 * citadas em cada nó (MS, SBI, Surviving Sepsis Campaign 2021, AHA/ACC, SBC,
 * AHA/ASA, IBCC), mas ainda NÃO passaram pela sessão de curadoria clínica
 * formal com o Dr. João (validação de cada nó/condição/conduta + registro de
 * assinatura com nome, CRM e data em docs/guidelines-catalog.md). Não
 * publicar em ambiente com pacientes reais antes dessa validação.
 *
 * AVC_AGUDO_CLASSIFICACAO (S21-CLIN-02) — adicionado como P2 do plano de
 * correção pós-demo (ver docs/guidelines-catalog.md, KB-003): a classificação
 * isquêmico x hemorrágico x AIT tem conduta oposta a depender do subtipo, e é
 * exatamente o tipo de decisão "cannot-miss com dois caminhos opostos" onde
 * uma árvore estruturada e determinística (este engine) é uma proteção mais
 * forte do que depender do modelo de linguagem escolher a pergunta certa via
 * RAG livre — o mesmo padrão de erro que gerou o incidente de demo.
 */

export type PilotNodeType = 'question' | 'action' | 'outcome';

export interface PilotCitation {
  source: string;
  sourceVersion: string;
  evidenceLevel?: string;
}

export interface PilotNodeContent {
  question?: string;
  answerType?: 'boolean';
  action?: string;
  outcome?: string;
  citation?: PilotCitation;
  citationChunkId?: string;
  [key: string]: unknown;
}

export interface PilotProtocolNode {
  id: string;
  nodeType: PilotNodeType;
  order: number;
  content: PilotNodeContent;
}

export interface PilotProtocolEdge {
  fromNodeId: string;
  toNodeId: string;
  condition?: { answer: boolean } | null;
}

export interface PilotProtocol {
  name: string;
  specialty: string;
  sourceRef: string;
  nodes: PilotProtocolNode[];
  edges: PilotProtocolEdge[];
}

const SINDROME_GRIPAL: PilotProtocol = {
  name: 'Síndrome gripal no PS',
  specialty: 'emergencia',
  sourceRef:
    'Protocolo MS — Síndrome Gripal (2023) + Diretriz SBI — Síndrome Gripal (2022). Curadoria clínica pendente: Dr. João (PROT-003).',
  nodes: [
    {
      id: 'srag_check',
      nodeType: 'question',
      order: 0,
      content: {
        question:
          'Paciente apresenta sinais de Síndrome Respiratória Aguda Grave (SRAG): SpO2 < 95% em ar ambiente, dispneia/desconforto respiratório, persistência de febre por mais de 3 dias, hipotensão ou piora de doença de base?',
        answerType: 'boolean',
      },
    },
    {
      id: 'srag_action',
      nodeType: 'action',
      order: 1,
      content: {
        action:
          'Indicar internação hospitalar e iniciar oseltamivir imediatamente, independentemente do tempo de sintomas. Avaliar necessidade de suporte de oxigênio/UTI.',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
    {
      id: 'srag_outcome',
      nodeType: 'outcome',
      order: 2,
      content: {
        outcome:
          'Internação hospitalar + oseltamivir imediato + monitorização contínua (quadro de SRAG).',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
    {
      id: 'sintomas_48h',
      nodeType: 'question',
      order: 3,
      content: {
        question: 'Os sintomas começaram há mais de 48 horas?',
        answerType: 'boolean',
      },
    },
    {
      id: 'oseltamivir_precoce_action',
      nodeType: 'action',
      order: 4,
      content: {
        action:
          'Iniciar oseltamivir 75mg de 12/12h por 5 dias, dentro da janela de maior eficácia (até 48h do início dos sintomas).',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
    {
      id: 'oseltamivir_precoce_outcome',
      nodeType: 'outcome',
      order: 5,
      content: {
        outcome:
          'Oseltamivir (início precoce, <48h) + orientação de sinais de alarme + retorno se piora.',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
    {
      id: 'grupo_risco',
      nodeType: 'question',
      order: 6,
      content: {
        question:
          'Paciente é gestante/puérpera (até 2 semanas pós-parto), imunossuprimido, tem ≥60 anos, ou possui comorbidade de risco (cardiopatia, pneumopatia crônica, diabetes, obesidade grau III)?',
        answerType: 'boolean',
      },
    },
    {
      id: 'oseltamivir_risco_action',
      nodeType: 'action',
      order: 7,
      content: {
        action:
          'Iniciar oseltamivir mesmo após 48h do início dos sintomas, dado o grupo de risco — benefício clínico mantido em populações vulneráveis.',
        citation: {
          source: 'Diretriz SBI — Síndrome Gripal',
          sourceVersion: '2022',
          evidenceLevel: 'consenso',
        },
      },
    },
    {
      id: 'oseltamivir_risco_outcome',
      nodeType: 'outcome',
      order: 8,
      content: {
        outcome: 'Oseltamivir (grupo de risco, mesmo >48h) + acompanhamento ambulatorial próximo.',
        citation: {
          source: 'Diretriz SBI — Síndrome Gripal',
          sourceVersion: '2022',
          evidenceLevel: 'consenso',
        },
      },
    },
    {
      id: 'sintomaticos_action',
      nodeType: 'action',
      order: 9,
      content: {
        action:
          'Tratamento sintomático (antitérmico, hidratação, repouso), sem indicação de antiviral. Orientar sinais de alarme e retorno imediato se piora.',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
    {
      id: 'sintomaticos_outcome',
      nodeType: 'outcome',
      order: 10,
      content: {
        outcome:
          'Tratamento sintomático ambulatorial + orientações de retorno (sem indicação de antiviral neste momento).',
        citation: {
          source: 'Protocolo MS — Síndrome Gripal',
          sourceVersion: '2023',
          evidenceLevel: 'diretriz_nacional',
        },
      },
    },
  ],
  edges: [
    { fromNodeId: 'srag_check', toNodeId: 'srag_action', condition: { answer: true } },
    { fromNodeId: 'srag_check', toNodeId: 'sintomas_48h', condition: { answer: false } },
    { fromNodeId: 'srag_action', toNodeId: 'srag_outcome' },
    {
      fromNodeId: 'sintomas_48h',
      toNodeId: 'oseltamivir_precoce_action',
      condition: { answer: false },
    },
    { fromNodeId: 'sintomas_48h', toNodeId: 'grupo_risco', condition: { answer: true } },
    { fromNodeId: 'oseltamivir_precoce_action', toNodeId: 'oseltamivir_precoce_outcome' },
    {
      fromNodeId: 'grupo_risco',
      toNodeId: 'oseltamivir_risco_action',
      condition: { answer: true },
    },
    { fromNodeId: 'grupo_risco', toNodeId: 'sintomaticos_action', condition: { answer: false } },
    { fromNodeId: 'oseltamivir_risco_action', toNodeId: 'oseltamivir_risco_outcome' },
    { fromNodeId: 'sintomaticos_action', toNodeId: 'sintomaticos_outcome' },
  ],
};

const SEPSE_BUNDLE_1H: PilotProtocol = {
  name: 'Sepse — bundle 1ª hora',
  specialty: 'medicina_intensiva',
  sourceRef: 'Surviving Sepsis Campaign 2021. Curadoria clínica pendente: Dr. João (PROT-003).',
  nodes: [
    {
      id: 'triagem',
      nodeType: 'question',
      order: 0,
      content: {
        question:
          'Paciente com suspeita de infecção apresenta qSOFA ≥ 2 (FR ≥ 22 irpm, PAS ≤ 100 mmHg, alteração do nível de consciência) ou critérios de alto risco no NEWS?',
        answerType: 'boolean',
      },
    },
    {
      id: 'sem_sepse_action',
      nodeType: 'action',
      order: 1,
      content: {
        action:
          'Critérios de sepse não preenchidos no momento. Manter monitorização clínica e reavaliar periodicamente.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'sem_sepse_outcome',
      nodeType: 'outcome',
      order: 2,
      content: {
        outcome: 'Observação clínica, sem ativação do bundle de sepse — reavaliar se houver piora.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'lactato_culturas_action',
      nodeType: 'action',
      order: 3,
      content: {
        action:
          'Coletar lactato sérico e 2 pares de hemoculturas antes da antibioticoterapia, sem atrasar o início do antibiótico aguardando resultados.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'atb_action',
      nodeType: 'action',
      order: 4,
      content: {
        action:
          'Iniciar antibioticoterapia empírica de amplo espectro em até 1 hora do reconhecimento da sepse.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'hipotensao_lactato',
      nodeType: 'question',
      order: 5,
      content: {
        question:
          'Paciente apresenta hipotensão (PAS < 90 mmHg ou PAM < 65 mmHg) ou lactato ≥ 4 mmol/L?',
        answerType: 'boolean',
      },
    },
    {
      id: 'cristaloide_action',
      nodeType: 'action',
      order: 6,
      content: {
        action:
          'Iniciar reposição volêmica com cristaloide 30 mL/kg, a ser concluída em até 3 horas.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'pam_pos_fluido',
      nodeType: 'question',
      order: 7,
      content: {
        question:
          'Após a reposição volêmica, a pressão arterial média (PAM) permanece < 65 mmHg (choque refratário a fluido)?',
        answerType: 'boolean',
      },
    },
    {
      id: 'vasopressor_action',
      nodeType: 'action',
      order: 8,
      content: {
        action:
          'Iniciar noradrenalina como vasopressor de primeira linha, com PAM-alvo ≥ 65 mmHg. Considerar acesso venoso central.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'vasopressor_outcome',
      nodeType: 'outcome',
      order: 9,
      content: {
        outcome:
          'Choque séptico com necessidade de vasopressor — iniciar noradrenalina e considerar UTI.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'reavaliacao_action',
      nodeType: 'action',
      order: 10,
      content: {
        action:
          'Reavaliar perfusão tecidual (lactato seriado, débito urinário, tempo de enchimento capilar) e manter monitorização contínua.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'reavaliacao_outcome',
      nodeType: 'outcome',
      order: 11,
      content: {
        outcome:
          'Bundle de 1ª hora completo com resposta adequada à reposição volêmica — manter reavaliação seriada e considerar enfermaria/UTI conforme gravidade.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'reavaliacao_leve_action',
      nodeType: 'action',
      order: 12,
      content: {
        action:
          'Reavaliar lactato em 2-4h e sinais de hipoperfusão; manter antibioticoterapia e monitorização clínica.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
    {
      id: 'reavaliacao_leve_outcome',
      nodeType: 'outcome',
      order: 13,
      content: {
        outcome:
          'Sepse sem choque — bundle de 1ª hora (lactato, culturas, antibiótico) cumprido, com reavaliação seriada.',
        citation: {
          source: 'Surviving Sepsis Campaign',
          sourceVersion: '2021',
          evidenceLevel: 'I-B',
        },
      },
    },
  ],
  edges: [
    { fromNodeId: 'triagem', toNodeId: 'sem_sepse_action', condition: { answer: false } },
    { fromNodeId: 'triagem', toNodeId: 'lactato_culturas_action', condition: { answer: true } },
    { fromNodeId: 'sem_sepse_action', toNodeId: 'sem_sepse_outcome' },
    { fromNodeId: 'lactato_culturas_action', toNodeId: 'atb_action' },
    { fromNodeId: 'atb_action', toNodeId: 'hipotensao_lactato' },
    {
      fromNodeId: 'hipotensao_lactato',
      toNodeId: 'cristaloide_action',
      condition: { answer: true },
    },
    {
      fromNodeId: 'hipotensao_lactato',
      toNodeId: 'reavaliacao_leve_action',
      condition: { answer: false },
    },
    { fromNodeId: 'cristaloide_action', toNodeId: 'pam_pos_fluido' },
    { fromNodeId: 'pam_pos_fluido', toNodeId: 'vasopressor_action', condition: { answer: true } },
    { fromNodeId: 'pam_pos_fluido', toNodeId: 'reavaliacao_action', condition: { answer: false } },
    { fromNodeId: 'vasopressor_action', toNodeId: 'vasopressor_outcome' },
    { fromNodeId: 'reavaliacao_action', toNodeId: 'reavaliacao_outcome' },
    { fromNodeId: 'reavaliacao_leve_action', toNodeId: 'reavaliacao_leve_outcome' },
  ],
};

const DOR_TORACICA: PilotProtocol = {
  name: 'Dor torácica no PS',
  specialty: 'cardiologia',
  sourceRef:
    'Diretriz AHA/ACC STEMI (2013/2022-update) + Diretriz AHA/ACC SCA (2022) + Diretriz SBC — SCA sem Supra (2021). Curadoria clínica pendente: Dr. João (PROT-003).',
  nodes: [
    {
      id: 'ecg_action',
      nodeType: 'action',
      order: 0,
      content: {
        action: 'Realizar ECG de 12 derivações em até 10 minutos da chegada do paciente.',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'supra_st',
      nodeType: 'question',
      order: 1,
      content: {
        question:
          'O ECG mostra supradesnivelamento do segmento ST (ou bloqueio de ramo esquerdo novo) compatível com STEMI?',
        answerType: 'boolean',
      },
    },
    {
      id: 'tempo_pci',
      nodeType: 'question',
      order: 2,
      content: {
        question:
          'O serviço tem capacidade de intervenção coronária percutânea (ICP) primária com tempo porta-balão ≤ 90 minutos?',
        answerType: 'boolean',
      },
    },
    {
      id: 'icp_action',
      nodeType: 'action',
      order: 3,
      content: {
        action:
          'Encaminhar para ICP primária em até 90 minutos do primeiro contato médico (porta-balão).',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'icp_outcome',
      nodeType: 'outcome',
      order: 4,
      content: {
        outcome: 'STEMI confirmado — reperfusão por ICP primária (porta-balão ≤ 90 min).',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'contraindicacao_tromb',
      nodeType: 'question',
      order: 5,
      content: {
        question:
          'Paciente apresenta contraindicação absoluta à trombólise (ex.: AVC hemorrágico prévio, sangramento ativo, dissecção aórtica)?',
        answerType: 'boolean',
      },
    },
    {
      id: 'trombolise_action',
      nodeType: 'action',
      order: 6,
      content: {
        action:
          'Realizar trombólise em até 30 minutos da chegada (porta-agulha), respeitando a janela terapêutica e ausência de contraindicações.',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'trombolise_outcome',
      nodeType: 'outcome',
      order: 7,
      content: {
        outcome:
          'STEMI sem ICP disponível em 90 min — trombólise (porta-agulha ≤ 30 min) seguida de transferência para centro com hemodinâmica.',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'transferencia_action',
      nodeType: 'action',
      order: 8,
      content: {
        action:
          'Transferir com urgência para centro com hemodinâmica, mantendo terapia antiplaquetária e anticoagulante.',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'transferencia_outcome',
      nodeType: 'outcome',
      order: 9,
      content: {
        outcome:
          'STEMI com contraindicação à trombólise — transferência urgente para ICP de resgate.',
        citation: {
          source: 'Diretriz AHA/ACC STEMI',
          sourceVersion: '2013/2022-update',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'troponina_heart_action',
      nodeType: 'action',
      order: 10,
      content: {
        action:
          'Coletar troponina seriada (0h e 1-3h) e calcular o escore HEART (ou TIMI) para estratificação de risco.',
        citation: {
          source: 'Diretriz SBC — SCA sem Supra',
          sourceVersion: '2021',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'heart_alto',
      nodeType: 'question',
      order: 11,
      content: {
        question:
          'Escore HEART ≥ 7 (alto risco) ou troponina positiva/em ascensão, compatível com NSTEMI?',
        answerType: 'boolean',
      },
    },
    {
      id: 'estrategia_invasiva_action',
      nodeType: 'action',
      order: 12,
      content: {
        action:
          'Iniciar antiagregação e anticoagulação e indicar estratégia invasiva precoce (cateterismo em até 24 horas).',
        citation: {
          source: 'Diretriz SBC — SCA sem Supra',
          sourceVersion: '2021',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'estrategia_invasiva_outcome',
      nodeType: 'outcome',
      order: 13,
      content: {
        outcome:
          'NSTEMI/alto risco — estratégia invasiva precoce (<24h) com antiagregação e anticoagulação.',
        citation: {
          source: 'Diretriz SBC — SCA sem Supra',
          sourceVersion: '2021',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'observacao_action',
      nodeType: 'action',
      order: 14,
      content: {
        action:
          'Manter em observação com troponina e ECG seriados; considerar teste provocativo ou exame de imagem se a dúvida diagnóstica persistir.',
        citation: { source: 'Diretriz AHA/ACC SCA', sourceVersion: '2022', evidenceLevel: 'I-B' },
      },
    },
    {
      id: 'observacao_outcome',
      nodeType: 'outcome',
      order: 15,
      content: {
        outcome:
          'HEART baixo/intermediário com troponina seriada negativa — observação, com possível alta e seguimento ambulatorial se mantiver estável.',
        citation: { source: 'Diretriz AHA/ACC SCA', sourceVersion: '2022', evidenceLevel: 'I-B' },
      },
    },
  ],
  edges: [
    { fromNodeId: 'ecg_action', toNodeId: 'supra_st' },
    { fromNodeId: 'supra_st', toNodeId: 'tempo_pci', condition: { answer: true } },
    { fromNodeId: 'supra_st', toNodeId: 'troponina_heart_action', condition: { answer: false } },
    { fromNodeId: 'tempo_pci', toNodeId: 'icp_action', condition: { answer: true } },
    { fromNodeId: 'tempo_pci', toNodeId: 'contraindicacao_tromb', condition: { answer: false } },
    { fromNodeId: 'icp_action', toNodeId: 'icp_outcome' },
    {
      fromNodeId: 'contraindicacao_tromb',
      toNodeId: 'transferencia_action',
      condition: { answer: true },
    },
    {
      fromNodeId: 'contraindicacao_tromb',
      toNodeId: 'trombolise_action',
      condition: { answer: false },
    },
    { fromNodeId: 'trombolise_action', toNodeId: 'trombolise_outcome' },
    { fromNodeId: 'transferencia_action', toNodeId: 'transferencia_outcome' },
    { fromNodeId: 'troponina_heart_action', toNodeId: 'heart_alto' },
    {
      fromNodeId: 'heart_alto',
      toNodeId: 'estrategia_invasiva_action',
      condition: { answer: true },
    },
    { fromNodeId: 'heart_alto', toNodeId: 'observacao_action', condition: { answer: false } },
    { fromNodeId: 'estrategia_invasiva_action', toNodeId: 'estrategia_invasiva_outcome' },
    { fromNodeId: 'observacao_action', toNodeId: 'observacao_outcome' },
  ],
};

const AVC_AGUDO_CLASSIFICACAO: PilotProtocol = {
  name: 'AVC agudo — classificação isquêmico x hemorrágico x AIT',
  specialty: 'neurologia',
  sourceRef:
    'IBCC — AVC agudo (Farkas J., EMCrit) + AHA/ASA 2019 Early Management of AIS + AHA/ASA 2022 ICH. ' +
    'Motivado pelo caso de demo em que o Copiloto (fluxo RAG livre) citou o chunk de AVC hemorrágico para ' +
    'um déficit flutuante e reversível — padrão de isquemia/AIT — enquanto Open Evidence e Volts foram para ' +
    'isquêmico. Ver docs/guidelines-catalog.md (KB-003). Curadoria clínica pendente: Dr. João (PROT-003).',
  nodes: [
    {
      id: 'deficit_flutuante_reversivel',
      nodeType: 'question',
      order: 0,
      content: {
        question:
          'Em algum momento desde o início do quadro, o déficit neurológico reverteu por completo (mesmo que tenha recorrido depois), em vez de permanecer fixo e contínuo desde o início?',
        answerType: 'boolean',
      },
    },
    {
      id: 'orienta_isquemico_ait_action',
      nodeType: 'action',
      order: 1,
      content: {
        action:
          'Um déficit que reverte e recorre (padrão flutuante/intermitente) é incompatível com hemorragia intracraniana ativa — sangue extravasado no parênquima não se reabsorve espontaneamente em minutos. Direcionar a investigação para isquemia/AIT, não para hemorragia. Solicitar TC de crânio sem contraste (função aqui é excluir hemorragia, não confirmar isquemia) e glicemia capilar imediata (hipoglicemia é o mimetizador mais simples de descartar).',
        citation: {
          source: 'IBCC — Approach to focal neurologic deficit',
          sourceVersion: 'Farkas J., EMCrit',
          evidenceLevel: 'sintese_especialista_ibcc',
        },
      },
    },
    {
      id: 'deficit_atual',
      nodeType: 'question',
      order: 2,
      content: {
        question:
          'No momento desta avaliação, o déficit neurológico está totalmente resolvido (paciente sem déficit agora)?',
        answerType: 'boolean',
      },
    },
    {
      id: 'conduta_ait_action',
      nodeType: 'action',
      order: 3,
      content: {
        action:
          'AIT (ataque isquêmico transitório) confirmado — déficit resolvido, por definição <24h. Calcular escore ABCD2 (idade, PA, achados clínicos, duração, diabetes): se ≥4, ou se houve AVC minor com NIHSS ≤5, considerar dupla antiagregação e investigação vascular em caráter de urgência (não ambulatorial tardia). Se ABCD2 <4, investigação ambulatorial rápida ainda é indicada, mas com menor urgência imediata.',
        citation: {
          source: 'IBCC — AIS (Acute Ischemic Stroke)',
          sourceVersion: 'Farkas J., EMCrit',
          evidenceLevel: 'sintese_especialista_ibcc',
        },
      },
    },
    {
      id: 'ait_outcome',
      nodeType: 'outcome',
      order: 4,
      content: {
        outcome:
          'AIT — ABCD2 + investigação vascular urgente (alto risco) ou ambulatorial rápida (baixo risco), sem indicação de trombólise (déficit já resolvido).',
        citation: {
          source: 'IBCC — AIS (Acute Ischemic Stroke)',
          sourceVersion: 'Farkas J., EMCrit',
          evidenceLevel: 'sintese_especialista_ibcc',
        },
      },
    },
    {
      id: 'tc_hemorragia',
      nodeType: 'question',
      order: 5,
      content: {
        question:
          'A TC de crânio sem contraste já foi realizada e mostrou hemorragia intracraniana?',
        answerType: 'boolean',
      },
    },
    {
      id: 'conduta_hemorragico_action',
      nodeType: 'action',
      order: 6,
      content: {
        action:
          'Reverter anticoagulação/antiagregação IMEDIATAMENTE, sem aguardar exames laboratoriais. Meta de PAS 140-150mmHg quando PAS inicial 150-220mmHg — evitar quedas abruptas de PAS >70mmHg na primeira hora (risco de hipoperfusão). Controlar dor/agitação antes de intensificar anti-hipertensivo (podem mascarar-se como hipertensão). Internação em UTI.',
        citation: {
          source: 'IBCC — ICH (Intracerebral hemorrhage)',
          sourceVersion: 'Farkas J., EMCrit',
          evidenceLevel: 'sintese_especialista_ibcc',
        },
      },
    },
    {
      id: 'hemorragico_outcome',
      nodeType: 'outcome',
      order: 7,
      content: {
        outcome:
          'AVC hemorrágico confirmado por TC — reversão de anticoagulação + controle pressórico com meta de PAS 140-150mmHg + UTI. Contraindicada trombólise/antiagregação.',
        citation: {
          source: 'IBCC — ICH (Intracerebral hemorrhage)',
          sourceVersion: 'Farkas J., EMCrit',
          evidenceLevel: 'sintese_especialista_ibcc',
        },
      },
    },
    {
      id: 'janela_trombolise',
      nodeType: 'question',
      order: 8,
      content: {
        question:
          'O início dos sintomas (ou a última vez em que o paciente foi visto normal) foi há menos de 4,5 horas, sem contraindicação conhecida à trombólise (ex.: sangramento ativo, cirurgia de grande porte recente)?',
        answerType: 'boolean',
      },
    },
    {
      id: 'trombolise_action',
      nodeType: 'action',
      order: 9,
      content: {
        action:
          'Avaliar elegibilidade para trombólise IV (alteplase). Meta de PA <185/110mmHg antes da infusão e <180/105mmHg nas 24h seguintes. NIHSS 0-5 (déficit não incapacitante) geralmente não indica trombólise — reavaliar risco-benefício nesse caso específico.',
        citation: {
          source: 'AHA/ASA AVC Isquêmico',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'trombolise_outcome',
      nodeType: 'outcome',
      order: 10,
      content: {
        outcome:
          'AVC isquêmico dentro da janela de trombólise (<4,5h) — avaliar elegibilidade para alteplase IV, com controle pressórico associado.',
        citation: {
          source: 'AHA/ASA AVC Isquêmico',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'grande_vaso_24h',
      nodeType: 'question',
      order: 11,
      content: {
        question:
          'Há suspeita clínica de oclusão de grande vaso (déficit importante, ex. NIHSS ≥6) com possibilidade de estender a janela até 24h por imagem avançada com penumbra preservada?',
        answerType: 'boolean',
      },
    },
    {
      id: 'trombectomia_action',
      nodeType: 'action',
      order: 12,
      content: {
        action:
          'Avaliar trombectomia mecânica para oclusão de grande vaso (carótida interna distal, M1, ACA proximal, basilar). Historicamente indicada com ASPECTS ≥6, mas evidência mais recente mostra benefício mesmo com ASPECTS 3-5 em core extenso — não descartar apenas pelo ASPECTS baixo sem avaliação especializada.',
        citation: {
          source: 'AHA/ASA Trombectomia',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'trombectomia_outcome',
      nodeType: 'outcome',
      order: 13,
      content: {
        outcome:
          'AVC isquêmico fora da janela de trombólise, mas dentro da janela estendida de trombectomia (até 24h) com suspeita de grande vaso — avaliação especializada urgente para trombectomia mecânica.',
        citation: {
          source: 'AHA/ASA Trombectomia',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'fora_janela_action',
      nodeType: 'action',
      order: 14,
      content: {
        action:
          'Fora das janelas de trombólise e trombectomia. Priorizar manejo clínico (antiagregação conforme protocolo institucional, controle de fatores de risco), investigação etiológica (ecocardiograma, Doppler de carótidas/vertebrais, holter conforme indicação) e prevenção secundária.',
        citation: {
          source: 'AHA/ASA AVC Isquêmico',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
    {
      id: 'fora_janela_outcome',
      nodeType: 'outcome',
      order: 15,
      content: {
        outcome:
          'AVC isquêmico fora de janela de reperfusão — manejo clínico + investigação etiológica + prevenção secundária, sem indicação de trombólise/trombectomia neste momento.',
        citation: {
          source: 'AHA/ASA AVC Isquêmico',
          sourceVersion: '2019',
          evidenceLevel: 'I-A',
        },
      },
    },
  ],
  edges: [
    {
      fromNodeId: 'deficit_flutuante_reversivel',
      toNodeId: 'orienta_isquemico_ait_action',
      condition: { answer: true },
    },
    {
      fromNodeId: 'deficit_flutuante_reversivel',
      toNodeId: 'tc_hemorragia',
      condition: { answer: false },
    },
    { fromNodeId: 'orienta_isquemico_ait_action', toNodeId: 'deficit_atual' },
    { fromNodeId: 'deficit_atual', toNodeId: 'conduta_ait_action', condition: { answer: true } },
    { fromNodeId: 'deficit_atual', toNodeId: 'janela_trombolise', condition: { answer: false } },
    { fromNodeId: 'conduta_ait_action', toNodeId: 'ait_outcome' },
    {
      fromNodeId: 'tc_hemorragia',
      toNodeId: 'conduta_hemorragico_action',
      condition: { answer: true },
    },
    { fromNodeId: 'tc_hemorragia', toNodeId: 'janela_trombolise', condition: { answer: false } },
    { fromNodeId: 'conduta_hemorragico_action', toNodeId: 'hemorragico_outcome' },
    { fromNodeId: 'janela_trombolise', toNodeId: 'trombolise_action', condition: { answer: true } },
    { fromNodeId: 'janela_trombolise', toNodeId: 'grande_vaso_24h', condition: { answer: false } },
    { fromNodeId: 'trombolise_action', toNodeId: 'trombolise_outcome' },
    { fromNodeId: 'grande_vaso_24h', toNodeId: 'trombectomia_action', condition: { answer: true } },
    { fromNodeId: 'grande_vaso_24h', toNodeId: 'fora_janela_action', condition: { answer: false } },
    { fromNodeId: 'trombectomia_action', toNodeId: 'trombectomia_outcome' },
    { fromNodeId: 'fora_janela_action', toNodeId: 'fora_janela_outcome' },
  ],
};

export const PILOT_PROTOCOLS: PilotProtocol[] = [
  SINDROME_GRIPAL,
  SEPSE_BUNDLE_1H,
  DOR_TORACICA,
  AVC_AGUDO_CLASSIFICACAO,
];
