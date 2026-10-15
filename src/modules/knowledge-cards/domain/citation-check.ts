import type {
  KnowledgeCardCitation,
  KnowledgeCardContentInput,
  KnowledgeCardContentIssue,
  KnowledgeCardDose,
} from '../../../shared/contracts/knowledge-cards';
import { findDoseMentions } from '../../copilot/guardrails/dose-detector';
import { MIN_QUOTE_CHARS } from './card-content';

/**
 * CC-403 — checagem determinística de citação. O modelo só SUGERE o trecho;
 * quem decide se ele existe é o código: um cartão com uma citação que não
 * está no texto da fonte, ou com uma dose que não está no trecho citado, não
 * vai para revisão. Vale para toda versão gravada, da IA ou do médico.
 */

/**
 * Acento, caixa, espaço e tipografia (aspas, travessão, ligaduras do PDF)
 * não mudam o que a fonte diz. Nada além disso: trocar unidade, vírgula
 * decimal ou abreviação já seria interpretar.
 */
export function normalizeForCitation(text: string): string {
  return text
    .normalize('NFKC')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-')
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„«»″]/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Na dose, nem o espaço conta: "2 g" e "2g", "mg/kg" e "mg / kg" são a mesma
 * dose. Só na dose — no trecho citado, colar palavras faria casar o que a
 * fonte não diz.
 */
function compactDose(text: string): string {
  return normalizeForCitation(text).replace(/ /g, '');
}

/** Texto integral de cada fonte do cartão, pela chave ("S1"). */
export type SourceTexts = ReadonlyMap<string, string>;

class CitationChecker {
  readonly issues: KnowledgeCardContentIssue[] = [];
  private readonly normalizedSources = new Map<string, string>();

  constructor(private readonly sourceTexts: SourceTexts) {}

  private sourceText(key: string): string | undefined {
    const cached = this.normalizedSources.get(key);
    if (cached !== undefined) return cached;
    const raw = this.sourceTexts.get(key);
    if (raw === undefined) return undefined;
    const normalized = normalizeForCitation(raw);
    this.normalizedSources.set(key, normalized);
    return normalized;
  }

  private add(path: string, message: string): void {
    this.issues.push({ path, message });
  }

  citation(citation: KnowledgeCardCitation, path: string): void {
    const source = this.sourceText(citation.sourceKey);
    if (source === undefined) {
      this.add(`${path}.sourceKey`, `a fonte ${citation.sourceKey} não está entre as fontes`);
      return;
    }
    const quote = normalizeForCitation(citation.quote);
    if (quote.length < MIN_QUOTE_CHARS) {
      this.add(`${path}.quote`, `trecho citado curto demais (mínimo ${MIN_QUOTE_CHARS} letras)`);
      return;
    }
    if (!source.includes(quote)) {
      this.add(
        `${path}.quote`,
        `trecho citado não encontrado no texto da fonte ${citation.sourceKey}`,
      );
    }
  }

  /** Toda dose escrita no texto precisa estar, literal, num dos trechos citados por ele. */
  dosesInText(text: string, quotes: readonly string[], path: string): void {
    const compactQuotes = quotes.map(compactDose);
    for (const mention of findDoseMentions(text)) {
      const dose = compactDose(mention);
      if (!compactQuotes.some((quote) => quote.includes(dose))) {
        this.add(path, `dose sem fonte: "${mention}" não está no trecho citado`);
      }
    }
  }

  /**
   * Dose estruturada: quantidade, via, frequência e dose máxima aparecem no
   * trecho citado pela dose; a droga, no texto da fonte (na tabela do PCDT o
   * nome costuma estar no cabeçalho, fora do trecho da linha).
   */
  structuredDose(dose: KnowledgeCardDose, path: string): void {
    this.citation(dose.citation, `${path}.citation`);
    if (!/\d/.test(dose.amount)) {
      this.add(`${path}.amount`, 'dose sem quantidade numérica');
    }
    const quote = compactDose(dose.citation.quote);
    const literalFields = {
      amount: dose.amount,
      route: dose.route,
      frequency: dose.frequency,
      maxDose: dose.maxDose,
    };
    for (const [field, value] of Object.entries(literalFields)) {
      if (value !== null && !quote.includes(compactDose(value))) {
        this.add(
          `${path}.${field}`,
          `dose sem fonte: "${value}" não está no trecho citado da dose`,
        );
      }
    }
    const source = this.sourceText(dose.citation.sourceKey);
    if (source !== undefined && !source.includes(normalizeForCitation(dose.drug))) {
      this.add(
        `${path}.drug`,
        `"${dose.drug}" não aparece no texto da fonte ${dose.citation.sourceKey}`,
      );
    }
  }
}

/**
 * Problemas de citação do conteúdo, vazio quando ele pode ir para revisão:
 * - toda citação aponta uma fonte do cartão e o trecho está no texto dela;
 * - toda dose escrita na resposta ou numa afirmação está num trecho citado
 *   por ela (o detector de dose da decisão — ADR-013 — diz o que é dose);
 * - a dose estruturada está, campo a campo, no trecho citado pela dose;
 * - a população não traz dose (ela não tem citação).
 *
 * `sourceTexts` traz o texto integral de cada chunk citado, pela chave.
 */
export function checkCardCitations(
  content: Pick<KnowledgeCardContentInput, 'population' | 'answer' | 'answerCitations' | 'claims'>,
  sourceTexts: SourceTexts,
): KnowledgeCardContentIssue[] {
  const checker = new CitationChecker(sourceTexts);

  content.answerCitations.forEach((citation, index) =>
    checker.citation(citation, `answerCitations[${index}]`),
  );
  checker.dosesInText(
    content.answer,
    content.answerCitations.map((citation) => citation.quote),
    'answer',
  );

  content.claims.forEach((claim, index) => {
    const path = `claims[${index}]`;
    claim.citations.forEach((citation, citationIndex) =>
      checker.citation(citation, `${path}.citations[${citationIndex}]`),
    );
    if (claim.dose) checker.structuredDose(claim.dose, `${path}.dose`);
    const quotes = [
      ...claim.citations.map((citation) => citation.quote),
      ...(claim.dose ? [claim.dose.citation.quote] : []),
    ];
    checker.dosesInText(claim.text, quotes, `${path}.text`);
  });

  if (content.population && findDoseMentions(content.population).length > 0) {
    checker.issues.push({ path: 'population', message: 'a população não pode trazer dose' });
  }

  return checker.issues;
}
