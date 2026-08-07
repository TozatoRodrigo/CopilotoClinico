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
    };

    questions: {
      heading: string;
      whyAsk: string;
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
    confidence: (value: number) => string;
    confidenceTooltipTitle: string;
    confidenceTooltipBody: string;
    confidenceTooltipDisclaimer: string;
  };

  redFlags: {
    heading: string;
    severity: {
      critical: string;
      high: string;
      moderate: string;
    };
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
    },

    questions: {
      // UX-01 — primeira pessoa do copiloto, reforça a metáfora do
      // preceptor perguntando à beira do leito. Nunca "Dados insuficientes"
      // ou qualquer framing que pareça culpar o relato do médico — essa
      // exata armadilha foi a causa da "parede" identificada na Sprint 26.
      heading: 'Para orientar com segurança, preciso de:',
      whyAsk: 'Por que essa pergunta?',
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
    confidence: (value: number) => `${Math.round(value * 100)}%`,
    // S23-UX-01 — explicação de metodologia para evitar falsa precisão clínica.
    // Médico pode interpretar "87%" como garantia estatística — médico-legalmente arriscado.
    confidenceTooltipTitle: 'Como calculamos a confiança',
    confidenceTooltipBody:
      'Combina cobertura da evidência recuperada (quantos trechos relevantes a diretriz forneceu) com coerência interna da análise (consistência entre raciocínio, recomendações e citações).',
    confidenceTooltipDisclaimer:
      'Não é garantia clínica ou probabilidade de acerto. A decisão final é sua, médico.',
  },

  redFlags: {
    heading: 'Sinais de alarme',
    severity: {
      critical: 'Crítico',
      high: 'Alto',
      moderate: 'Moderado',
    },
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
