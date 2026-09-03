/**
 * Centralized UI copy — es (Spanish).
 *
 * PI-05 — segunda instância do dicionário `Messages` (ver `pt-BR.ts` para a
 * interface completa e as convenções gerais de tom clínico).
 *
 * IMPORTANTE — terminologia clínica: esta tradução foi feita com cuidado para
 * evitar falsos cognatos (ex.: "embarazada" ≠ "embaraçada"; "constipado" em
 * espanhol significa "resfriado", não "constipado" no sentido intestinal —
 * nenhum destes termos aparece aqui, mas o padrão vale para futuras entradas
 * neste arquivo). AINDA ASSIM, esta tradução NÃO teve revisão por um
 * profissional de saúde nativo em espanhol — isso é um requisito de
 * segurança antes do lançamento para usuários hispanofalantes, não um
 * nice-to-have. Ver PI-05 no ClickUp.
 *
 * Guideline citations always stay in Portuguese regardless of UI locale (see
 * prompt-builder.ts SYSTEM_INSTRUCTION) — this dictionary only covers UI
 * chrome, never citation text, so no guideline content is translated here.
 */
import type { Messages } from './pt-BR';

export const es: Messages = {
  common: {
    actions: {
      tryAgain: 'Intentar de nuevo',
      backToHome: 'Ir al inicio',
      // "atendimento" traducido como "caso" para mantener coherencia con
      // caseLabel/caseLabel más abajo (el producto habla de "caso clínico"
      // de forma consistente, no de "consulta" o "atención").
      backToEncounters: 'Volver a los casos',
      goToAnalysis: 'Ir al análisis',
    },
  },

  copilot: {
    result: {
      title: 'Resultado del análisis',
      recommendationsCount: (n: number) => `${n} ${n === 1 ? 'recomendación' : 'recomendaciones'}`,
      // "2 definitivas · 1 preliminar"
      preliminarySummary: (definitive: number, preliminary: number) =>
        `${definitive} definitiva${definitive === 1 ? '' : 's'} · ${preliminary} preliminar${preliminary === 1 ? '' : 'es'}`,
    },

    questions: {
      heading: 'Para orientar con seguridad, necesito:',
      whyAsk: '¿Por qué esta pregunta?',
      boolean: {
        yes: 'Sí',
        no: 'No',
        unknown: 'No sé',
      },
    },

    reanalyze: {
      cta: 'Reanalizar con las respuestas',
      ctaShort: 'Reanalizar',
      loading: 'Reanalizando...',
      errorTitle: 'Error al reanalizar',
    },

    progress: {
      round: (current: number, max: number) => `Ronda ${current} de ${max}`,
      expectationHint:
        'Al responder esto, la conducta puede pasar de preliminar a definitiva.',
      lastRoundWarning:
        'Última ronda — el análisis se finalizará con la información disponible.',
    },

    queued: {
      title: 'Respuesta en cola',
      description: 'Sin conexión. La respuesta se enviará al volver a estar en línea.',
      descriptionLong:
        'Sin conexión en este momento. La respuesta se enviará automáticamente cuando vuelva a estar en línea.',
    },

    recommendations: {
      heading: 'Recomendaciones',
    },

    sections: {
      preliminary: 'Preliminares',
      conduta: 'Conducta',
    },

    differentials: {
      heading: '¿Ya consideró?',
      whatDistinguishes: 'Qué diferencia:',
      // "diagnóstico ineludible" es el término usado en literatura clínica
      // en español para "cannot-miss diagnosis" — más preciso que una
      // traducción literal de "não pode passar".
      cannotMiss: 'Ineludible',
    },

    citations: {
      heading: 'Citas',
      institutionalBadge: 'Protocolo institucional',
      publicBadge: 'Guía pública',
      institutionalBadgeShort: 'Protocolo',
      publicBadgeShort: 'Guía',
      viewExcerpt: 'Ver fragmento',
      viewExcerptShort: 'fragmento',
      figureFallback: (source: string) => `Figura — ${source}`,
    },

    turns: {
      history: 'Historial de turnos',
      previous: 'Turnos anteriores',
      turnLabel: (idx: number) => `Turno ${idx}`,
      previousSummary: (idx: number, n: number) =>
        `Turno ${idx} · ${n} pregunta${n === 1 ? '' : 's'} respondida${n === 1 ? '' : 's'}`,
    },
  },

  recommendation: {
    category: {
      stabilization: 'Ahora',
      diagnostic: 'Diagnóstico',
      therapeutic: 'Conducta',
      verify: 'Reevaluar',
    },
    categoryBracket: (label: string) => `[${label}]`,
    preliminary: 'Preliminar — responda las preguntas anteriores',
    confidence: (value: number) => `${Math.round(value * 100)}%`,
    confidenceTooltipTitle: 'Cómo calculamos la confianza',
    confidenceTooltipBody:
      'Combina la cobertura de la evidencia recuperada (cuántos fragmentos relevantes aportó la guía) con la coherencia interna del análisis (consistencia entre el razonamiento, las recomendaciones y las citas).',
    confidenceTooltipDisclaimer:
      'No es una garantía clínica ni una probabilidad de acierto. La decisión final es suya.',
  },

  redFlags: {
    heading: 'Señales de alarma',
    severity: {
      critical: 'Crítico',
      high: 'Alto',
      moderate: 'Moderado',
    },
  },

  coverage: {
    none: {
      title: 'Ninguna guía de la base cubre este escenario',
      body: 'El análisis a continuación no cita guías porque la base de conocimiento todavía no tiene contenido para esta presentación. Las preguntas sirven para llegar al protocolo correcto — no sustituyen a una guía. Si tiene una referencia para este escenario, envíela a curaduría.',
    },
    partial: {
      title: 'Cobertura parcial de la base',
      body: 'Las guías recuperadas no encajan bien con este caso. Verifique si la fuente citada trata la misma presentación antes de seguir la conducta.',
    },
    action: 'Buscar en las guías',
  },

  uncertainty: {
    title: 'Incertidumbre en el análisis',
    defaultReason:
      'Evidencia insuficiente para este escenario. Se recomienda una revisión adicional.',
    actions: {
      complementCase: 'Complementar el caso',
      searchGuidelines: 'Buscar en las guías',
    },
    complement: {
      heading: 'Complementar información del caso',
      placeholder:
        'Agregue lo que ayude a aclarar el cuadro — tiempo de evolución, signos vitales, exámenes ya realizados...',
      submit: 'Reanalizar con el complemento',
      submitting: 'Reanalizando...',
      cancel: 'Cancelar',
    },
  },

  blocker: {
    changesConduct: 'Cambia la conducta',
    whyAsk: '¿Por qué esta pregunta?',
  },

  capture: {
    resources: 'Recursos',
    // Mantido em inglês como no dicionário pt-BR original — rótulo curto e
    // consolidado para a seção de chips de fatores de risco, não uma
    // tradução esquecida.
    redFlags: 'Red flags',
    complaintHint: 'Plantillas de motivo de consulta',
    voice: {
      listening: 'Escuchando...',
      tapToDictate: 'Toque para dictar',
      start: 'Iniciar grabación',
      stop: 'Detener grabación',
      unsupportedTitle: 'Voz en mejora',
      unsupportedDescription:
        'Estamos habilitando el dictado por voz en este dispositivo. Por ahora, describa el caso escribiendo — el análisis funciona normalmente.',
      transcribing: 'Transcribiendo...',
      recording: 'Grabando',
      cancel: 'Cancelar',
      sendAndTranscribe: 'Suelte para enviar',
      slideToCancel: 'Deslice para cancelar',
      maxReached: 'Límite de 5 minutos — enviando...',
      emptyTranscript: 'No detectamos habla clara en el audio. Intente de nuevo.',
      emptyRecording: 'Grabación vacía. Toque el micrófono y hable.',
      micDenied: 'Permiso de micrófono denegado. Habilítelo en la configuración del navegador.',
      micNotFound: 'No se encontró ningún micrófono en este dispositivo.',
      recordingError: 'Error en la grabación. Intente de nuevo.',
      networkError: 'Sin conexión. Verifique su internet e intente de nuevo.',
      serverError: 'Servidor no disponible. Intente de nuevo en unos instantes.',
      rateLimited: 'Demasiadas transcripciones en poco tiempo. Espere un minuto.',
    },
    charMin: (n: number) => `Mínimo ${n} caracteres`,
    readyToAnalyze: 'Listo para analizar',
    placeholder: 'O escriba el caso aquí...',
    caseLabel: 'Descripción del caso clínico',
    cta: 'Analizar con Copiloto',
    ctaLoading: 'Analizando...',
    offlineHint: 'Sin conexión — el análisis se enviará al reconectar',
    offlineQueued: 'Sin conexión. El análisis se enviará cuando vuelva a estar en línea.',
    errorAnalyze:
      'No fue posible analizar el caso. Verifique los datos e intente de nuevo.',
    templateApplied: (name: string) => `Plantilla "${name}" agregada al caso.`,
    streamingHint: 'El copiloto ya está respondiendo...',
  },

  documents: {
    generateHeading: 'Generar documento',
    generating: 'Generando...',
    // "Documento generado" concuerda siempre en masculino singular, evitando
    // depender del género de `type` (SOAP, SBAR, Prescripción, Alta,
    // Certificado — géneros mixtos).
    generated: (type: string) => `Documento generado: ${type} — abierto en una pestaña nueva.`,
    newAnalysis: 'Nuevo análisis',
    encounter: 'Caso',
    types: {
      soap: 'SOAP',
      sbar: 'SBAR',
      prescricao: 'Prescripción',
      alta: 'Alta',
      atestado: 'Certificado',
    },
    errorGenerate: 'No fue posible generar el documento. Intente de nuevo.',
    errorTitle: 'Error',
  },

  seal: {
    signing: 'Firmando conducta…',
    error: 'No fue posible firmar la conducta. Intente de nuevo.',
    confirmed: 'Conducta confirmada y firmada',
  },

  errors: {
    title: 'Error',
    sessionExpired: 'Sesión expirada. Inicie sesión nuevamente.',
    httpError: (status: number) => `Error ${status}`,
    genericTitle: 'Algo salió mal',
    genericDescription:
      'Ocurrió un error inesperado. Puede intentar de nuevo o volver al inicio.',
    encounterLoadTitle: 'Error al cargar el caso',
    encounterLoadDescription:
      'No fue posible cargar los datos de este caso. Intente de nuevo en unos instantes.',
    analysisLoadTitle: 'Error al cargar el análisis',
    analysisLoadDescription:
      'No fue posible cargar el análisis. Intente de nuevo o abra un caso nuevo.',
    analysisEmpty: 'No se encontró ningún resultado de análisis.',
  },
};
