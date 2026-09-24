import type { DocumentSection, SectionedDocument } from './official-guideline.types';

/**
 * ADR-010 — Recorte de PCDT/DDT/DB/PU por seção.
 *
 * No PCDT de AVC, as seções clínicas são ~12% do PDF; o resto é portaria,
 * metodologia, referências e apêndice GRADE. Sem este recorte, ~80% dos chunks
 * seriam bibliografia competindo no retrieval com a conduta.
 *
 * Os 190 documentos da Conitec (2007 a 2026) usam quatro convenções de título
 * de primeiro nível. Cada uma vira uma estratégia, tentada em ordem da mais
 * para a menos restritiva; a primeira que reconhece estrutura vence:
 *
 * 1. numerado em maiúsculas — "3. DIAGNÓSTICO", "7 TRATAMENTO", "7 - TRATAMENTO";
 * 2. numerado em caixa mista — "4. Diagnóstico e Estadiamento", "7 Local de
 *    assistência" (título curto, sem ":" nem ponto final — o que separa título
 *    de item de lista como "7. As mulheres devem receber:");
 * 3. sem número, em maiúsculas — "DIAGNÓSTICO" (PCDTs de 2023 em diante, que
 *    numeram só as subseções);
 * 4. nenhuma — o corpo entra inteiro até o primeiro anexo/referência.
 *
 * Toda estratégia precisa achar ao menos dois títulos do vocabulário de seção
 * (DIAGNÓSTICO, TRATAMENTO…): é o que impede uma lista de créditos ("2
 * FEBRASGO – FEDERAÇÃO…") ou de critérios ("1. Prurido") de virar estrutura.
 *
 * Defeitos de extração tratados: cabeçalho de página grudado no título
 * ("…Diretrizes Terapêuticas8 TRATAMENTO") e título perdido na extração (a
 * numeração pode pular até dois números).
 */

const UPPER = 'A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ';
/** Prefixo opcional que termina em minúscula colado ao número (cabeçalho de página). */
const GLUED_PREFIX = String.raw`(?:.*?[a-zà-ÿ)])?\s*`;
/** "3." / "3" / "3 -" / "3 –". "8.1 TRATAMENTO" não casa: depois do ponto vem dígito. */
const NUMBER = String.raw`(\d{1,2})(?:\.|\s*[-–])?\s+`;

/**
 * Palavras com que um título de seção de documento do MS começa. Valida o
 * resultado de toda estratégia e define os títulos da estratégia sem número,
 * onde qualquer linha curta em maiúsculas poderia parecer título.
 */
const SECTION_VOCABULARY = [
  'INTRODU',
  'APRESENTA',
  'METODOLOGIA',
  'MÉTODOS',
  'ESCOPO',
  'CLASSIFICA',
  'DIAGN',
  'CRITÉRIOS',
  'CASOS ESPECIAIS',
  'TRATAMENTO',
  'TEMPO DE TRATAMENTO',
  'ABORDAGEM',
  'OPÇÕES TERAPÊUTICAS',
  'FÁRMACO',
  'MEDICAMENTO',
  'ESQUEMA',
  'MONITORIZA',
  'MONITORAMENTO',
  'ACOMPANHAMENTO',
  'SEGUIMENTO',
  'RASTREAMENTO',
  'PREVENÇÃO',
  'PROFILAXIA',
  'MANEJO',
  'CONDUTA',
  'RECOMENDA',
  'RESUMO DAS RECOMENDA',
  'ESTADIAMENTO',
  'BENEFÍCIOS',
  'FLUXO',
  'REGULAÇÃO',
  'TERMO DE ESCLARECIMENTO',
  'REFERÊNCIAS',
];
const VOCABULARY = `(?:${SECTION_VOCABULARY.join('|')})`;

const NUMBERED_UPPERCASE = new RegExp(
  String.raw`^${GLUED_PREFIX}${NUMBER}([${UPPER}][${UPPER}0-9 ,/()\-–:]{3,140})$`,
);
const NUMBERED_TITLECASE = new RegExp(
  String.raw`^${GLUED_PREFIX}${NUMBER}([${UPPER}][^:;]{2,90}[^:;.,])$`,
);
const VOCABULARY_TITLE = new RegExp(String.raw`^${VOCABULARY}`);
const MIN_VOCABULARY_TITLES = 2;
const MAX_TITLE_WORDS = 14;
const UNNUMBERED_UPPERCASE = new RegExp(String.raw`^(${VOCABULARY}[${UPPER}0-9 ,/()\-–:]{0,100})$`);

/**
 * Fim do corpo: tudo depois disto é anexo, apêndice, termo de consentimento ou
 * bibliografia. As variantes em caixa mista só valem como linha inteira —
 * "Referências Parte I - …" de um documento em partes não encerra o corpo.
 */
const TERMINATOR_PATTERN =
  /^(?:APÊNDICE|APENDICE|TERMO DE ESCLARECIMENTO|ANEXOS?\b|REFERÊNCIAS)|^(?:Refer[êe]ncias(?: [Bb]ibliogr[áa]ficas)?|Bibliografia):?$/;
/** Linha de sumário: "REFERÊNCIAS ........................ 22". */
const TABLE_OF_CONTENTS_LINE = /\.{6,}\s*\d*\s*$/;
const REFERENCES_TITLE = /REFER[ÊE]NCIAS/;
const CID_TITLE = /CLASSIFICA[ÇC][ÃA]O ESTAT[ÍI]STICA|\bCID\b/;
const INTRODUCTION_TITLE = /INTRODU[ÇC][ÃA]O|APRESENTA[ÇC][ÃA]O/;
/**
 * Seções que não mudam conduta. Tudo o que não está aqui entra — inclusive
 * seções de nome irregular como "ESCOPO" (onde uma Diretriz Brasileira guarda
 * as recomendações) ou "ABORDAGEM TERAPÊUTICA".
 */
const EXCLUDED_TITLE =
  /INTRODU[ÇC][ÃA]O|APRESENTA[ÇC][ÃA]O|METODOLOGIA|M[ÉE]TODOS|CLASSIFICA[ÇC][ÃA]O ESTAT[ÍI]STICA|\bCID\b|REGULA[ÇC][ÃA]O|GESTOR|ESCLARECIMENTO E RESPONSABILIDADE|REFER[ÊE]NCIAS|HIST[ÓO]RICO/;
/** Código CID-10: letra, dois dígitos e subcategoria opcional. */
const CID10_PATTERN = /\b([A-Z]\d{2}(?:\.\d{1,2})?)\b/g;

const MAX_HEADING_SKIP = 3;
const MAX_FIRST_HEADING = 3;
const INTRODUCTION_CHARS = 2500;
const MAX_CID_CODES = 200;

interface Heading {
  line: number;
  number: number | null;
  title: string;
}

interface Strategy {
  pattern: RegExp;
  numbered: boolean;
  /** Seções mínimas (sem contar referências) para aceitar a estratégia. */
  minSections: number;
}

const STRATEGIES: readonly Strategy[] = [
  { pattern: NUMBERED_UPPERCASE, numbered: true, minSections: 2 },
  { pattern: NUMBERED_TITLECASE, numbered: true, minSections: 3 },
  { pattern: UNNUMBERED_UPPERCASE, numbered: false, minSections: 3 },
];

function normalizeLine(line: string): string {
  return line.replace(/\u00a0/g, ' ').trim();
}

function findHeadings(
  lines: string[],
  strategy: Strategy,
): { headings: Heading[]; bodyEnd: number } {
  const headings: Heading[] = [];
  let last = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = normalizeLine(lines[i]!);

    // Uma linha "REFERÊNCIAS" sem número também é título na estratégia 3.
    if (headings.length > 0 && TERMINATOR_PATTERN.test(line)) {
      return { headings, bodyEnd: i };
    }

    const match = line.match(strategy.pattern);
    if (!match) continue;

    const title = match[strategy.numbered ? 2 : 1]!.replace(/\s+/g, ' ').trim();
    if (title.split(' ').length > MAX_TITLE_WORDS) continue;

    const number = strategy.numbered ? Number(match[1]) : null;
    if (number !== null) {
      const inSequence = headings.length === 0 ? number <= MAX_FIRST_HEADING : number > last;
      if (!inSequence || number - last > MAX_HEADING_SKIP) continue;
      last = number;
    }

    headings.push({ line: i, number, title });

    // Referências numeradas encerram o corpo do protocolo.
    if (REFERENCES_TITLE.test(title.toLocaleUpperCase('pt-BR'))) {
      return { headings, bodyEnd: i };
    }
  }

  return { headings, bodyEnd: lines.length };
}

function toSections(lines: string[], headings: Heading[], bodyEnd: number): DocumentSection[] {
  return headings
    .filter((heading) => !REFERENCES_TITLE.test(heading.title.toLocaleUpperCase('pt-BR')))
    .map((heading, index, all) => {
      const next = all[index + 1];
      return {
        number: heading.number,
        title: heading.title,
        text: lines
          .slice(heading.line + 1, next ? next.line : bodyEnd)
          .join('\n')
          .trim(),
        included: !EXCLUDED_TITLE.test(heading.title.toLocaleUpperCase('pt-BR')),
      };
    });
}

function extractCid10(text: string): string[] {
  const codes = new Set<string>();
  for (const match of text.matchAll(CID10_PATTERN)) {
    codes.add(match[1]!);
    if (codes.size >= MAX_CID_CODES) break;
  }
  return [...codes];
}

function fallbackBody(lines: string[]): string {
  const start = lines.findIndex((line) => /^ANEXO$/i.test(line.trim()));
  const body = lines.slice(start === -1 ? 0 : start + 1);
  const end = body.findIndex((line, index) => index > 0 && TERMINATOR_PATTERN.test(line.trim()));
  return (end === -1 ? body : body.slice(0, end)).join('\n').trim();
}

function includedChars(sections: DocumentSection[]): number {
  return sections
    .filter((section) => section.included)
    .reduce((sum, section) => sum + section.text.length, 0);
}

export function sectionDocument(text: string): SectionedDocument {
  // O sumário repete os títulos (inclusive "REFERÊNCIAS") antes do corpo.
  const lines = text.split('\n').filter((line) => !TABLE_OF_CONTENTS_LINE.test(line));

  for (const strategy of STRATEGIES) {
    const { headings, bodyEnd } = findHeadings(lines, strategy);
    const sections = toSections(lines, headings, bodyEnd);
    const upper = (section: DocumentSection) => section.title.toLocaleUpperCase('pt-BR');
    const vocabularyTitles = headings.filter((heading) =>
      VOCABULARY_TITLE.test(heading.title.toLocaleUpperCase('pt-BR')),
    ).length;
    if (
      sections.length < strategy.minSections ||
      vocabularyTitles < MIN_VOCABULARY_TITLES ||
      includedChars(sections) === 0
    ) {
      continue;
    }

    const cidSection = sections.find((section) => CID_TITLE.test(upper(section)));
    const introduction =
      sections.find((section) => INTRODUCTION_TITLE.test(upper(section)))?.text ??
      sections.find((section) => section.included)!.text;

    return {
      sections,
      sectioning: 'structured',
      cid10: cidSection ? extractCid10(cidSection.text) : [],
      introduction: introduction.slice(0, INTRODUCTION_CHARS),
    };
  }

  // Sem estrutura reconhecível, o corpo entra inteiro até o primeiro
  // anexo/referência — e o documento fica marcado como `fallback` no
  // relatório para revisão.
  const body = fallbackBody(lines);
  return {
    sections: [{ number: null, title: 'TEXTO INTEGRAL', text: body, included: true }],
    sectioning: 'fallback',
    cid10: [],
    introduction: body.slice(0, INTRODUCTION_CHARS),
  };
}
