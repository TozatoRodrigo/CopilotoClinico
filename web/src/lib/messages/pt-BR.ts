/**
 * Centralized UI copy — pt-BR (default locale).
 *
 * This is the single source of truth for user-facing strings. Keeping copy here
 * makes the app i18n-ready (swap the dictionary to change locale) and lets us
 * guard the clinical tone in one place (see `__tests__/messages.guard.test.ts`).
 *
 * Conventions:
 * - Clinical, sober tone. No AI "slop".
 * - The copilot only ever *suggests / indicates / recommends* — never *diagnoses
 *   / guarantees / cures*. See FORBIDDEN_AI_TERMS in index.ts.
 * - Pluralization lives in functions (n) => string so it stays locale-correct.
 *
 * `Messages` is a hand-written structural type (not `typeof ptBR as const`) on
 * purpose — PI-05: a `typeof` derivation narrows every string to its pt-BR
 * literal type (e.g. `tryAgain: 'Tentar novamente'`), which would make it
 * impossible for `es.ts` (or any future locale) to type-check with different
 * string values. Every locale dictionary implements this same interface.
 */

import type { CitationOrigin, PreliminaryReason, PsSyndrome } from '@contracts/clinical';

export interface Messages {
  common: {
    actions: {
      tryAgain: string;
      backToHome: string;
      backToEncounters: string;
      goToAnalysis: string;
    };
  };

  copilot: {
    result: {
      title: string;
      recommendationsCount: (n: number) => string;
      preliminarySummary: (definitive: number, preliminary: number) => string;
      /** F1 — decisão v2: "2 para agora · 1 depende de dado". */
      layersSummary: (now: number, depends: number) => string;
    };

    questions: {
      heading: string;
      whyAsk: string;
      /** F1 — decisão v2: hipóteses que a resposta separa ("Separa: A × B"). */
      separates: (hypotheses: string[]) => string;
      boolean: {
        yes: string;
        no: string;
        unknown: string;
      };
    };

    reanalyze: {
      cta: string;
      ctaShort: string;
      loading: string;
      errorTitle: string;
    };

    progress: {
      round: (current: number, max: number) => string;
      expectationHint: string;
      lastRoundWarning: string;
    };

    queued: {
      title: string;
      description: string;
      descriptionLong: string;
    };

    recommendations: {
      heading: string;
    };

    sections: {
      preliminary: string;
      conduta: string;
    };

    differentials: {
      heading: string;
      whatDistinguishes: string;
      cannotMiss: string;
    };

    citations: {
      heading: string;
      institutionalBadge: string;
      publicBadge: string;
      institutionalBadgeShort: string;
      publicBadgeShort: string;
      viewExcerpt: string;
      viewExcerptShort: string;
      figureFallback: (source: string) => string;
    };

    turns: {
      history: string;
      previous: string;
      turnLabel: (idx: number) => string;
      previousSummary: (idx: number, n: number) => string;
    };
  };

  recommendation: {
    category: {
      stabilization: string;
      diagnostic: string;
      therapeutic: string;
      verify: string;
    };
    categoryBracket: (label: string) => string;
    preliminary: string;
    /** Tag de conduta preliminar no card da recomendação. */
    preliminaryBadge: string;
    /**
     * F0-C — por que a conduta é preliminar, por valor de `preliminaryReason`.
     * `pending_questions` (e análise antiga sem o campo) mostra só
     * `preliminaryBadge`, o texto de sempre.
     */
    preliminaryReason: Record<Exclude<PreliminaryReason, 'pending_questions'>, string>;
    /** F1 — grupos da decisão v2 (ADR-013): o que fazer agora e o que espera um dado. */
    layers: Record<'now' | 'depends', { label: string; hint: string }>;
    dependsOn: (data: string) => string;
    /** Conduta "depende" sem o dado declarado (o validador pede, mas não bloqueia). */
    dependsOnMissing: string;
    /** F1 — link para a página da fonte oficial externa (pesquisa web). */
    openSourcePage: string;
  };

  /**
   * Rótulo de origem da fonte citada, por valor de `Citation.origin` (F4,
   * ADR-010, ADR-012). A interface sempre diz se a fonte passou por médico.
   */
  sourceOrigin: Record<CitationOrigin, string>;

  redFlags: {
    heading: string;
    severity: {
      critical: string;
      high: string;
      moderate: string;
    };
  };

  /**
   * KB-005/KB-006 — aviso de cobertura da base de diretrizes. Distinto de
   * `uncertainty`: incerteza é sobre o raciocínio; cobertura é sobre o que a
   * base CONTÉM. Um caso pode ter raciocínio seguro e cobertura nenhuma.
   */
  coverage: {
    none: { title: string; body: string };
    partial: { title: string; body: string };
    action: string;
  };

  uncertainty: {
    title: string;
    defaultReason: string;
    actions: {
      complementCase: string;
      searchGuidelines: string;
    };
    complement: {
      heading: string;
      placeholder: string;
      submit: string;
      submitting: string;
      cancel: string;
    };
  };

  /**
   * F1 — card "O que eu entendi" (ADR-013, Etapa 1): o que o copiloto
   * entendeu do caso ANTES de buscar evidência, para o médico conferir e
   * corrigir antes de ler o plano.
   */
  understanding: {
    heading: string;
    description: string;
    /** Mostrado na captura enquanto o plano ainda está sendo montado. */
    streamingHint: string;
    syndrome: string;
    syndromes: Record<PsSyndrome, string>;
    instabilityTitle: string;
    data: {
      heading: string;
      age: (years: number) => string;
      sex: Record<'F' | 'M', string>;
      bloodPressure: (systolic: number | null, diastolic: number | null) => string;
      heartRate: (value: number) => string;
      respiratoryRate: (value: number) => string;
      spo2: (value: number) => string;
      temperature: (value: number) => string;
      glucose: (value: number) => string;
      onset: (value: string) => string;
    };
    cannotMissHeading: string;
    confirmOrRuleOut: string;
    likelyHeading: string;
    missingHeading: string;
    separates: (hypotheses: string[]) => string;
    correction: {
      cta: string;
      label: string;
      placeholder: string;
      submit: string;
      submitting: string;
      cancel: string;
    };
  };

  blocker: {
    changesConduct: string;
    whyAsk: string;
  };

  capture: {
    resources: string;
    redFlags: string;
    complaintHint: string;
    voice: {
      listening: string;
      tapToDictate: string;
      start: string;
      stop: string;
      unsupportedTitle: string;
      unsupportedDescription: string;
      transcribing: string;
      recording: string;
      cancel: string;
      sendAndTranscribe: string;
      slideToCancel: string;
      maxReached: string;
      emptyTranscript: string;
      emptyRecording: string;
      micDenied: string;
      micNotFound: string;
      recordingError: string;
      networkError: string;
      serverError: string;
      rateLimited: string;
    };
    charMin: (n: number) => string;
    readyToAnalyze: string;
    placeholder: string;
    caseLabel: string;
    cta: string;
    ctaLoading: string;
    offlineHint: string;
    offlineQueued: string;
    errorAnalyze: string;
    templateApplied: (name: string) => string;
    streamingHint: string;
  };

  /**
   * ADR-014 — Copiloto guiado: a conversa do caso. Primeira pessoa e sem
   * culpa ("a parede" da Sprint 26): o Copiloto pede porque quer acertar a
   * conduta, e pular nunca é erro.
   */
  conversation: {
    title: string;
    description: string;
    sendCase: string;
    sendingCase: string;
    you: string;
    copilot: string;
    reading: string;
    understood: string;
    correct: string;
    correctionPlaceholder: string;
    correctionNoted: string;
    questionsIntro: (count: number) => string;
    progress: (current: number, total: number) => string;
    analyzeNow: string;
    unstableTitle: (findings: string) => string;
    unstableBody: string;
    complete: string;
    urgentStop: string;
    skipped: string;
    allAnswered: string;
    buildingPlan: string;
    buildingPlanHint: string;
    rebuildingPlan: string;
    planFailed: string;
    retryPlan: string;
    followUpIntro: (count: number) => string;
    keepPlan: string;
    rebuildNow: string;
    previousPlan: (round: number) => string;
    youAnswered: string;
    lastRound: string;
    limitReached: string;
    numberPlaceholder: string;
    numberSend: string;
    numberUnknown: string;
    vitals: {
      labels: Record<'bloodPressure' | 'heartRate' | 'respiratoryRate' | 'spo2' | 'temperature' | 'glucose', string>;
      units: Record<'bloodPressure' | 'heartRate' | 'respiratoryRate' | 'spo2' | 'temperature' | 'glucose', string>;
      bloodPressurePlaceholder: string;
      send: string;
      none: string;
      invalid: string;
    };
    composer: {
      answerPlaceholder: string;
      complementPlaceholder: string;
      waitingPlaceholder: string;
      send: string;
      dictate: string;
      stopDictation: string;
      transcribing: string;
      offline: string;
    };
  };

  documents: {
    generateHeading: string;
    generating: string;
    generated: (type: string) => string;
    newAnalysis: string;
    encounter: string;
    types: {
      soap: string;
      sbar: string;
      prescricao: string;
      alta: string;
      atestado: string;
    };
    errorGenerate: string;
    errorTitle: string;
  };

  seal: {
    signing: string;
    error: string;
    confirmed: string;
  };

  errors: {
    title: string;
    sessionExpired: string;
    httpError: (status: number) => string;
    genericTitle: string;
    genericDescription: string;
    encounterLoadTitle: string;
    encounterLoadDescription: string;
    analysisLoadTitle: string;
    analysisLoadDescription: string;
    analysisEmpty: string;
  };
}

const PT_BR_NUMBER = new Intl.NumberFormat('pt-BR');

function formatNumberPtBr(value: number): string {
  return PT_BR_NUMBER.format(value);
}

export const ptBR: Messages = {
  common: {
    actions: {
      tryAgain: 'Tentar novamente',
      backToHome: 'Ir para o início',
      backToEncounters: 'Voltar para atendimentos',
      goToAnalysis: 'Ir para análise',
    },
  },

  copilot: {
    result: {
      title: 'Resultado da Análise',
      recommendationsCount: (n: number) => `${n} recomendaç${n === 1 ? 'ão' : 'ões'}`,
      // "2 definitivas · 1 preliminar"
      preliminarySummary: (definitive: number, preliminary: number) =>
        `${definitive} definitiv${definitive === 1 ? 'a' : 'as'} · ${preliminary} preliminar${preliminary === 1 ? '' : 'es'}`,
      // "2 para agora · 1 depende de dado"
      layersSummary: (now: number, depends: number) =>
        `${now} para agora · ${depends} depende${depends === 1 ? '' : 'm'} de dado`,
    },

    questions: {
      // UX-01 — primeira pessoa do copiloto, reforça a metáfora do
      // preceptor perguntando à beira do leito. Nunca "Dados insuficientes"
      // ou qualquer framing que pareça culpar o relato do médico — essa
      // exata armadilha foi a causa da "parede" identificada na Sprint 26.
      heading: 'Para orientar com segurança, preciso de:',
      whyAsk: 'Por que essa pergunta?',
      separates: (hypotheses: string[]) => `Separa: ${hypotheses.join(' × ')}`,
      boolean: {
        yes: 'Sim',
        no: 'Não',
        unknown: 'Não sei',
      },
    },

    reanalyze: {
      cta: 'Reanalisar com as respostas',
      ctaShort: 'Reanalisar',
      loading: 'Reanalisando...',
      errorTitle: 'Erro ao reanalisar',
    },

    // UX-03 — indicador de progresso do fluxo guiado ("Rodada N de M"), para
    // o ciclo de perguntas iterativo não parecer um loop sem fim no meio do
    // plantão.
    progress: {
      round: (current: number, max: number) => `Rodada ${current} de ${max}`,
      expectationHint:
        'Respondendo isto, a conduta pode passar de preliminar a definitiva.',
      lastRoundWarning:
        'Última rodada — a análise será finalizada com as informações disponíveis.',
    },

    queued: {
      title: 'Resposta enfileirada',
      // decision-thread variant
      description: 'Sem conexão. A resposta será enviada quando voltar online.',
      // copilot-conversation variant
      descriptionLong:
        'Sem conexão no momento. A resposta será enviada automaticamente quando você voltar a ficar online.',
    },

    recommendations: {
      heading: 'Recomendações',
    },

    sections: {
      preliminary: 'Preliminares',
      conduta: 'Conduta',
    },

    differentials: {
      heading: 'Já considerou?',
      whatDistinguishes: 'O que diferencia:',
      // PI-03 — rótulo curto e direto, mesmo critério de um red flag
      // crítico. Redação a validar com Dr. Gustavo/Dr. Ripardo no piloto.
      cannotMiss: 'Não pode passar',
    },

    citations: {
      heading: 'Citações',
      institutionalBadge: 'Protocolo institucional',
      publicBadge: 'Diretriz pública',
      institutionalBadgeShort: 'Protocolo',
      publicBadgeShort: 'Diretriz',
      viewExcerpt: 'Ver trecho',
      viewExcerptShort: 'trecho',
      figureFallback: (source: string) => `Figura — ${source}`,
    },

    turns: {
      history: 'Histórico de turnos',
      previous: 'Turnos anteriores',
      turnLabel: (idx: number) => `Turno ${idx}`,
      // "Turno 2 · 3 perguntas respondidas"
      previousSummary: (idx: number, n: number) =>
        `Turno ${idx} · ${n} pergunta${n === 1 ? '' : 's'} respondida${n === 1 ? '' : 's'}`,
    },
  },

  recommendation: {
    category: {
      stabilization: 'Agora',
      diagnostic: 'Diagnóstico',
      therapeutic: 'Conduta',
      verify: 'Reavaliar',
    },
    // bracketed form used in turn history
    categoryBracket: (label: string) => `[${label}]`,
    preliminary: 'Preliminar — responda as perguntas acima',
    preliminaryBadge: 'Preliminar',
    preliminaryReason: {
      unreviewed_source: 'Fonte não revisada por médico',
      subtype_ambiguity: 'Subtipo indefinido — depende do dado que discrimina',
      depends_on_data: 'Depende de dado ainda não disponível',
      unverified_dose: 'Dose sem fonte citada — confirme no protocolo local',
      source_conflict: 'Fonte oficial diverge — confira antes de seguir',
    },
    layers: {
      now: { label: 'Fazer agora', hint: 'seguro em todas as hipóteses abertas' },
      depends: { label: 'Depende de…', hint: 'só depois do dado que decide' },
    },
    dependsOn: (data: string) => `Depende de: ${data}`,
    dependsOnMissing: 'Depende de dado ainda não informado',
    openSourcePage: 'Abrir página da fonte',
  },

  sourceOrigin: {
    institutional: 'Protocolo institucional',
    public: 'Diretriz pública',
    physician_attachment: 'Anexo do médico · não curada',
    official_unreviewed: 'Ministério da Saúde · não revisado pela equipe',
    curated_unsigned: 'Base curada · sem assinatura médica',
    model_knowledge: 'Conhecimento geral do modelo — confirme no protocolo local',
    web_official: 'Fonte oficial externa',
  },

  redFlags: {
    heading: 'Sinais de alarme',
    severity: {
      critical: 'Crítico',
      high: 'Alto',
      moderate: 'Moderado',
    },
  },

  coverage: {
    none: {
      title: 'Nenhuma diretriz da base cobre este cenário',
      body: 'A análise abaixo não cita diretriz porque a base de conhecimento ainda não tem conteúdo para esta apresentação. As perguntas servem para chegar ao protocolo certo — não são substituto de uma diretriz. Se você tem uma referência para este cenário, envie para a curadoria.',
    },
    partial: {
      title: 'Cobertura parcial da base',
      body: 'As diretrizes recuperadas não são um encaixe forte para este caso. Confira se a fonte citada trata da mesma apresentação antes de seguir a conduta.',
    },
    action: 'Buscar nas diretrizes',
  },

  uncertainty: {
    title: 'Incerteza na análise',
    defaultReason:
      'Evidência insuficiente para este cenário. Recomenda-se revisão adicional.',
    // UX-02 — nenhum estado do copiloto termina sem uma ação disponível;
    // este banner sempre oferece pelo menos uma das duas.
    actions: {
      complementCase: 'Complementar o caso',
      searchGuidelines: 'Buscar nas diretrizes',
    },
    complement: {
      heading: 'Complementar informações do caso',
      placeholder:
        'Acrescente o que ajudar a esclarecer o quadro — tempo de evolução, sinais vitais, exames já feitos...',
      submit: 'Reanalisar com o complemento',
      submitting: 'Reanalisando...',
      cancel: 'Cancelar',
    },
  },

  understanding: {
    heading: 'O que eu entendi',
    description: 'Confira antes do plano. Se algo estiver errado, corrija e o copiloto reanalisa.',
    streamingHint: 'Montando o plano a partir deste entendimento…',
    syndrome: 'Síndrome',
    syndromes: {
      'agitacao-psicomotora': 'Agitação psicomotora',
      cefaleia: 'Cefaleia',
      choque: 'Choque',
      'crise-convulsiva': 'Crise convulsiva',
      'deficit-neurologico-focal': 'Déficit neurológico focal',
      'diarreia-vomitos': 'Diarreia e vômitos',
      'disturbio-glicemico': 'Distúrbio glicêmico',
      dispneia: 'Dispneia',
      'dor-abdominal': 'Dor abdominal',
      'dor-lombar-flanco': 'Dor lombar ou em flanco',
      'dor-toracica': 'Dor torácica',
      febre: 'Febre',
      'febre-hipotensao': 'Febre com hipotensão',
      'infeccao-respiratoria': 'Infecção respiratória',
      intoxicacao: 'Intoxicação',
      'pele-partes-moles': 'Pele e partes moles',
      'pressao-arterial-elevada': 'Pressão arterial elevada',
      'reacao-alergica': 'Reação alérgica',
      'rebaixamento-consciencia': 'Rebaixamento de consciência',
      'sintomas-urinarios': 'Sintomas urinários',
      vertigem: 'Vertigem',
      outro: 'Outra síndrome',
    },
    instabilityTitle: 'Instabilidade — ameaça imediata',
    data: {
      heading: 'Dados informados',
      age: (years: number) => `${formatNumberPtBr(years)} anos`,
      sex: { F: 'Feminino', M: 'Masculino' },
      bloodPressure: (systolic: number | null, diastolic: number | null) =>
        `PA ${systolic ?? '?'}x${diastolic ?? '?'}`,
      heartRate: (value: number) => `FC ${formatNumberPtBr(value)}`,
      respiratoryRate: (value: number) => `FR ${formatNumberPtBr(value)}`,
      spo2: (value: number) => `SpO₂ ${formatNumberPtBr(value)}%`,
      temperature: (value: number) => `Tax ${formatNumberPtBr(value)}`,
      glucose: (value: number) => `Glicemia ${formatNumberPtBr(value)}`,
      onset: (value: string) => `Início: ${value}`,
    },
    cannotMissHeading: 'Não pode perder',
    confirmOrRuleOut: 'Confirma ou afasta:',
    likelyHeading: 'Mais prováveis',
    missingHeading: 'O que falta saber',
    separates: (hypotheses: string[]) => `Separa ${hypotheses.join(' × ')}`,
    correction: {
      cta: 'Corrigir entendimento',
      label: 'O que o copiloto entendeu errado ou deixou de fora?',
      placeholder: 'Ex.: o déficit regrediu em 10 minutos e voltou duas vezes.',
      submit: 'Reanalisar com a correção',
      submitting: 'Reanalisando...',
      cancel: 'Cancelar',
    },
  },

  blocker: {
    changesConduct: 'Muda a conduta',
    whyAsk: 'Por que essa pergunta?',
  },

  capture: {
    resources: 'Recursos',
    redFlags: 'Red flags',
    complaintHint: 'Modelos de queixa',
    voice: {
      listening: 'Ouvindo...',
      tapToDictate: 'Toque para ditar',
      start: 'Iniciar gravação',
      stop: 'Parar gravação',
      // S20-VOICE-01 — fallback claro quando webkitSpeechRecognition não é suportado
      // (iOS Safari, Firefox). Ponte temporária até a Sprint 21 (Whisper no backend),
      // que tornará a voz independente do navegador.
      unsupportedTitle: 'Voz em melhoria',
      unsupportedDescription:
        'Estamos habilitando o ditado por voz neste dispositivo. Por enquanto, descreva o caso digitando — a análise funciona normalmente.',
      // S21-VOICE-03/04/05 — copy do novo hook Whisper (MediaRecorder + upload).
      transcribing: 'Transcrevendo...',
      recording: 'Gravando',
      cancel: 'Cancelar',
      sendAndTranscribe: 'Solte para enviar',
      slideToCancel: 'Deslize para cancelar',
      maxReached: 'Limite de 5 minutos — enviando...',
      emptyTranscript: 'Não detectamos fala clara no áudio. Tente novamente.',
      emptyRecording: 'Gravação vazia. Toque o microfone e fale.',
      micDenied: 'Permissão de microfone negada. Habilite nas configurações do navegador.',
      micNotFound: 'Nenhum microfone encontrado neste dispositivo.',
      recordingError: 'Erro na gravação. Tente novamente.',
      networkError: 'Sem conexão. Verifique sua internet e tente novamente.',
      serverError: 'Servidor indisponível. Tente novamente em instantes.',
      rateLimited: 'Muitas transcrições em pouco tempo. Aguarde um minuto.',
    },
    charMin: (n: number) => `Mínimo ${n} caracteres`,
    readyToAnalyze: 'Pronto para analisar',
    placeholder: 'Ou digite o caso aqui...',
    caseLabel: 'Descrição do caso clínico',
    cta: 'Analisar com Copiloto',
    ctaLoading: 'Analisando...',
    offlineHint: 'Sem conexão — análise será enviada ao reconectar',
    offlineQueued: 'Sem conexão. Análise será enviada quando voltar online.',
    errorAnalyze:
      'Não foi possível analisar o caso. Verifique os dados e tente novamente.',
    // S23-CLIN-01 — feedback ao aplicar template de queixa.
    templateApplied: (name: string) => `Modelo "${name}" adicionado ao caso.`,
    // UX-06 — streaming: sinal de vida rápido em vez de spinner mudo.
    streamingHint: 'O copiloto já está respondendo...',
  },

  conversation: {
    title: 'Descreva o caso',
    description:
      'Dite ou digite como passaria o caso a um colega. Se faltar algo que muda a conduta, eu pergunto — uma coisa por vez.',
    sendCase: 'Enviar caso',
    sendingCase: 'Enviando…',
    you: 'Você',
    copilot: 'Copiloto',
    reading: 'Lendo o caso…',
    understood: 'Entendi:',
    correct: 'Corrigir',
    correctionPlaceholder: 'O que eu entendi errado ou deixei de fora?',
    correctionNoted: 'Anotei a correção — ela entra no plano.',
    questionsIntro: (count: number) =>
      count === 1
        ? 'Antes do plano, 1 pergunta rápida que muda a conduta.'
        : `Antes do plano, ${count} perguntas rápidas que mudam a conduta.`,
    progress: (current: number, total: number) => `Pergunta ${current} de ${total}`,
    analyzeNow: 'Analisar agora com o que tenho',
    unstableTitle: (findings: string) => `Paciente instável: ${findings}.`,
    unstableBody:
      'Vou direto ao que fazer agora, sem perguntas antes. Se eu precisar de algo, pergunto depois do plano.',
    complete: 'Tenho o que preciso para começar.',
    urgentStop: 'Essa resposta muda a prioridade. Vou direto ao plano.',
    skipped:
      'Sem problema. Sigo com o que tenho; o que ficou aberto entra no plano como "Depende de…".',
    allAnswered: 'Obrigado. Montando o plano com o que você me contou.',
    buildingPlan: 'Montando o plano…',
    buildingPlanHint: 'Leva cerca de 1 minuto. Pode sair desta tela: o plano fica salvo no caso.',
    rebuildingPlan: 'Refazendo o plano com a sua resposta…',
    planFailed: 'Não consegui montar o plano agora.',
    retryPlan: 'Tentar de novo',
    followUpIntro: (count: number) =>
      count === 1
        ? 'Para fechar o plano, 1 pergunta. Responder refaz o plano (cerca de 1 minuto).'
        : `Para fechar o plano, ${count} perguntas. Responder refaz o plano (cerca de 1 minuto).`,
    keepPlan: 'Seguir com este plano',
    rebuildNow: 'Refazer o plano agora',
    previousPlan: (round: number) => `Plano anterior · rodada ${round}`,
    youAnswered: 'Você informou',
    lastRound: 'Última rodada — o próximo plano sai com o que você tiver informado.',
    limitReached: 'Você chegou ao limite de rodadas deste caso.',
    numberPlaceholder: 'Valor',
    numberSend: 'Enviar',
    numberUnknown: 'Não medi',
    vitals: {
      labels: {
        bloodPressure: 'PA',
        heartRate: 'FC',
        respiratoryRate: 'FR',
        spo2: 'SpO₂',
        temperature: 'Tax',
        glucose: 'Glicemia capilar',
      },
      units: {
        bloodPressure: 'mmHg',
        heartRate: 'bpm',
        respiratoryRate: 'irpm',
        spo2: '%',
        temperature: '°C',
        glucose: 'mg/dL',
      },
      bloodPressurePlaceholder: '120/80',
      send: 'Enviar',
      none: 'Não tenho agora',
      invalid: 'Confira os valores: a PA vai como 120/80 e os outros só com números.',
    },
    composer: {
      answerPlaceholder: 'Ou responda com suas palavras…',
      complementPlaceholder: 'Acrescente algo ao caso (ex.: resultado de exame)…',
      waitingPlaceholder: 'Aguarde o plano…',
      send: 'Enviar',
      dictate: 'Ditar',
      stopDictation: 'Parar e transcrever',
      transcribing: 'Transcrevendo…',
      offline: 'Sem conexão. Sua mensagem fica no campo até a internet voltar.',
    },
  },

  documents: {
    generateHeading: 'Gerar documento',
    generating: 'Gerando...',
    // S23-CLIN-05 — confirmação de geração (sem sair da tela de resultado).
    generated: (type: string) => `${type} gerado — aberto em nova aba.`,
    newAnalysis: 'Nova Análise',
    encounter: 'Atendimento',
    types: {
      soap: 'SOAP',
      sbar: 'SBAR',
      prescricao: 'Prescrição',
      alta: 'Alta',
      atestado: 'Atestado',
    },
    errorGenerate: 'Não foi possível gerar o documento. Tente novamente.',
    errorTitle: 'Erro',
  },

  seal: {
    signing: 'Assinando conduta…',
    error: 'Não foi possível assinar a conduta. Tente novamente.',
    confirmed: 'Conduta confirmada e assinada',
  },

  errors: {
    title: 'Erro',
    sessionExpired: 'Sessão expirada. Faça login novamente.',
    httpError: (status: number) => `Erro ${status}`,
    genericTitle: 'Algo deu errado',
    genericDescription:
      'Ocorreu um erro inesperado. Você pode tentar novamente ou voltar ao início.',
    encounterLoadTitle: 'Erro ao carregar atendimento',
    encounterLoadDescription:
      'Não foi possível carregar os dados deste atendimento. Tente novamente em instantes.',
    analysisLoadTitle: 'Erro ao carregar análise',
    analysisLoadDescription:
      'Não foi possível carregar a análise. Tente novamente ou abra um novo caso.',
    analysisEmpty: 'Nenhum resultado de análise encontrado.',
  },
};
