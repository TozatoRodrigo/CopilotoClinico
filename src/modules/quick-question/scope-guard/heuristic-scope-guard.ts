import { Injectable } from '@nestjs/common';
import { scanForInjection } from '../../copilot/guardrails/injection-defense';
import {
  accept,
  refuse,
  type QuickQuestionScopeGuard,
  type QuickQuestionScopeVerdict,
} from './quick-question-scope-guard';

/**
 * CC-503 — guarda determinística da pergunta rápida: a barreira de injeção do
 * Copiloto (inglês e português) e regras de texto.
 *
 * Errar recusando é pior que errar respondendo: o médico barrado no plantão
 * perde a dúvida, e a pergunta fora do escopo que passa só custa uma busca
 * (vira lacuna, sem modelo de linguagem). Por isso a ordem é: injeção; caso
 * inteiro; vocabulário clínico (aceita); administrativo; não clínico; e, sem
 * sinal nenhum, aceita.
 */

export const HEURISTIC_GUARD_NAME = 'heuristic';

/** Sem acento e em minúsculas: "Diagnóstico" e "diagnostico" são o mesmo termo. */
function normalize(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Pedido explícito sobre um paciente: o caso inteiro vai pelo fluxo do caso. */
const WHOLE_CASE_REQUESTS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  {
    name: 'what_does_patient_have',
    pattern:
      /\bo que (ele|ela|o paciente|a paciente|meu paciente|minha paciente|esse paciente|essa paciente|este paciente|esta paciente) (tem|teria|pode ter)\b/,
  },
  {
    name: 'patient_diagnosis',
    pattern:
      /\bqual (e |seria )?o diagnostico (dele|dela|do paciente|da paciente|deste caso|desse caso|do caso)\b/,
  },
  {
    name: 'analyze_case',
    pattern: /\b(analise|avalie|interprete|discuta|resolva) (este|esse|o|meu|um) caso\b/,
  },
];

/**
 * Marcas de relato: idade, sinais vitais com valor, narrativa de admissão e
 * jargão de evolução. Uma ou duas cabem numa dúvida ("criança de 5 anos, PA
 * 80x50"); três ou mais são um caso.
 */
const CASE_MARKERS: ReadonlyArray<{ name: string; pattern: RegExp }> = [
  { name: 'age', pattern: /\b\d{1,3}\s*(anos|meses)\b/ },
  {
    name: 'blood_pressure',
    pattern: /\b(pa|pressao arterial)\s*:?\s*\d{2,3}\s*(x|\/)\s*\d{2,3}\b/,
  },
  { name: 'heart_rate', pattern: /\bfc\s*:?\s*\d{2,3}\b/ },
  { name: 'respiratory_rate', pattern: /\bfr\s*:?\s*\d{1,2}\b/ },
  { name: 'oxygen_saturation', pattern: /\b(spo2|sato2|sat|saturacao)\s*:?\s*\d{2,3}\b/ },
  { name: 'temperature', pattern: /\b(tax|temp|temperatura)\s*:?\s*3\d([.,]\d)?\b/ },
  { name: 'glucose', pattern: /\b(hgt|glicemia|dextro)\s*:?\s*\d{2,3}\b/ },
  {
    name: 'admission_narrative',
    pattern:
      /\b(deu entrada|admitid[oa]|chegou ao (ps|pronto|hospital)|trazid[oa] (pelo|pela|por)|ha \d+\s*(h|horas|dias|semanas)|evolui(u|ndo) com|refere|relata)\b/,
  },
  { name: 'chart_jargon', pattern: /\b(hda|qp|hpp|ao exame|exame fisico|beg|reg|meg|lote|loc)\b/ },
];
const CASE_MARKER_THRESHOLD = 3;
/** Acima disto, o tamanho conta como mais uma marca de relato. */
const LONG_QUESTION_CHARS = 240;

/** Vocabulário de PS: se aparece, a pergunta segue (só injeção e caso inteiro recusam antes). */
const CLINICAL_TERMS =
  /\b(dose|doses|dosagem|posologia|mg|mcg|ug|ml|ui|kg|ampola|comprimido|infusao|bolus|antidoto|intoxicac\w*|antibiotic\w*|tratamento|tratar|conduta|manejo|diagnostic\w*|criterio\w*|escore|score|glasgow|nihss|rass|qsofa|classificacao|sinais|sintoma\w*|exame\w*|tomografia|raio-?x|ecg|eletrocardiograma|ultrassom|paciente|crianca|lactente|neonato|recem-?nascido|gestante|gravida|adulto|idoso|pronto-?socorro|emergencia|uti|internacao|intubacao|ventilacao|sedacao|analgesia|dor|febre|choque|sepse|parada|pcr|rcp|avc|iam|infarto|sca|tep|tvp|asma|dpoc|pneumonia|meningite|dengue|anafilaxia|convulsao|cetoacidose|hipoglicemia|hipercalemia|arritmia|fibrilacao|taquicardia|bradicardia|hipertensao|hipotensao|insuficiencia|fratura|trauma|queimadura|picada|mordedura|envenenamento|overdose|notificacao|vacina|profilaxia|contraindicac\w*|interacao|alergia|medicamento|remedio|farmaco)\b/;

const ADMINISTRATIVE_TERMS: ReadonlyArray<RegExp> = [
  /\b(senha|login|logar|cadastro|meu crm|verificacao do crm)\b/,
  // "Escala" sozinha é clínica ("escala de Glasgow"): só a escala de trabalho é administrativa.
  /\b(minha escala|escala de (plantao|amanha|hoje|trabalho)|escala do (mes|fim de semana|plantao)|troca de plantao|trocar (o |de )?plantao|folga|ferias|holerite|salario|pagamento|nota fiscal|faturamento|glosa|tiss|tuss)\b/,
  /\bcomo (eu )?(uso|usar|acesso|acessar|configuro|configurar|instalo|instalar|cancelo|cancelar)\b.*\b(copiloto|app|aplicativo|sistema|plataforma)\b/,
];

const NOT_CLINICAL_TERMS =
  /\b(piada|poema|poesia|musica|filme|serie|novela|futebol|jogo do|campeonato|eleicao|politica|bitcoin|cripto\w*|bolsa de valores|investimento|previsao do tempo|horoscopo|signo|receita de bolo|culinaria|programacao|codigo em|javascript|python|typescript|sql|planilha|excel|traduza|traducao|redacao|escreva um (texto|e-?mail|post|artigo)|capital d[aoe])\b/;

/** Pura: o veredito da heurística para a pergunta já mascarada. */
export function classifyByHeuristic(maskedQuestion: string): QuickQuestionScopeVerdict {
  const injection = scanForInjection(maskedQuestion);
  if (!injection.safe) return refuse('injection', HEURISTIC_GUARD_NAME, injection.reasons);

  const text = normalize(maskedQuestion);
  const request = WHOLE_CASE_REQUESTS.find(({ pattern }) => pattern.test(text));
  if (request) return refuse('whole_case', HEURISTIC_GUARD_NAME, [request.name]);

  const markers = CASE_MARKERS.filter(({ pattern }) => pattern.test(text)).map(({ name }) => name);
  if (maskedQuestion.length > LONG_QUESTION_CHARS) markers.push('long_text');
  if (markers.length >= CASE_MARKER_THRESHOLD) {
    return refuse('whole_case', HEURISTIC_GUARD_NAME, markers);
  }

  if (CLINICAL_TERMS.test(text)) return accept(HEURISTIC_GUARD_NAME, ['clinical_terms']);
  if (ADMINISTRATIVE_TERMS.some((pattern) => pattern.test(text))) {
    return refuse('administrative', HEURISTIC_GUARD_NAME, ['administrative_terms']);
  }
  if (NOT_CLINICAL_TERMS.test(text)) {
    return refuse('not_clinical', HEURISTIC_GUARD_NAME, ['not_clinical_terms']);
  }
  return accept(HEURISTIC_GUARD_NAME, ['no_signal']);
}

@Injectable()
export class HeuristicScopeGuard implements QuickQuestionScopeGuard {
  readonly name = HEURISTIC_GUARD_NAME;

  async classify(maskedQuestion: string): Promise<QuickQuestionScopeVerdict> {
    return classifyByHeuristic(maskedQuestion);
  }
}
