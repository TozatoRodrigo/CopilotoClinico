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
 */

export const ptBR = {
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
      heading: 'Perguntas do copiloto',
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
  },

  documents: {
    generateHeading: 'Gerar documento',
    generating: 'Gerando...',
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
} as const;

export type Messages = typeof ptBR;
