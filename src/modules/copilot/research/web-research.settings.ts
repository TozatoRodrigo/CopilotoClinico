import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';
import { AI_EFFORTS, type AiEffort } from '../../ai-gateway/providers/provider.interface';

/**
 * F1 — configuração da pesquisa web (`COPILOT_KNOWLEDGE_SOURCE=web`), lida a
 * cada análise para valer sem redeploy. Também usada pelo gabarito clínico
 * para registrar no run.json o que a variante rodou de fato.
 */

export const DEFAULT_RESEARCH_MODEL = 'claude-sonnet-5-5';
export const DEFAULT_WEB_RESEARCH_MAX_SEARCHES = 5;
/** Teto de custo: cada busca custa US$ 0,01 e enche o contexto. */
const MAX_WEB_RESEARCH_SEARCHES = 20;

/**
 * Fontes confiáveis para conduta de PS: Ministério da Saúde e órgãos federais
 * (gov.br cobre Conitec e os protocolos do SAMU 192), sociedades brasileiras
 * de especialidade e as diretrizes internacionais de referência. Cada entrada
 * cobre os seus subdomínios (docs das ferramentas de servidor da Anthropic).
 */
export const DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS = [
  'gov.br',
  'cfm.org.br',
  'scielo.br',
  'portal.cardiol.br',
  'abccardiol.org',
  'abneuro.org.br',
  'avc.org.br',
  'amib.org.br',
  'abramede.com.br',
  'sbpt.org.br',
  'infectologia.org.br',
  'diabetes.org.br',
  'endocrino.org.br',
  'sbp.com.br',
  'febrasgo.org.br',
  'ilas.org.br',
  'ahajournals.org',
  'heart.org',
  'escardio.org',
  'academic.oup.com',
  'nice.org.uk',
  'who.int',
  'cdc.gov',
  'ncbi.nlm.nih.gov',
  'sccm.org',
  'idsociety.org',
  'ginasthma.org',
  'goldcopd.org',
  'acep.org',
  'worldallergy.org',
  'erc.edu',
  'resus.org.uk',
] as const;

/**
 * A Messages API não documenta teto para `allowed_domains`, mas devolve
 * `request_too_large` quando a lista é longa demais; o Managed Agents limita a
 * 64 entradas. Ficamos no menor limite documentado.
 */
export const MAX_ALLOWED_DOMAINS = 64;

/**
 * Hostname ASCII simples, com pelo menos dois rótulos e TLD alfabético: sem
 * esquema, porta, caminho, curinga ou IP — formatos que a API recusa com 400
 * (e Unicode, que permitiria homógrafo de um domínio confiável).
 */
const HOSTNAME =
  /^(?=.{1,255}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

export function readResearchModel(config: ConfigService): string {
  const configured = config.get<string | undefined>('AI_RESEARCH_MODEL')?.trim();
  return configured ? configured : DEFAULT_RESEARCH_MODEL;
}

/** Baixo por padrão: a pesquisa só precisa achar e citar, e a latência soma. */
export function readResearchEffort(config: ConfigService): AiEffort {
  return readChoiceFlag(config, 'AI_RESEARCH_EFFORT', AI_EFFORTS, 'low');
}

/** Inteiro de 1 a 20; ausente ou inválido cai no padrão (5). */
export function readWebResearchMaxSearches(config: ConfigService): number {
  const raw = config.get<string | number | undefined>('WEB_RESEARCH_MAX_SEARCHES');
  const value = Number(raw);
  if (raw === undefined || raw === '' || !Number.isInteger(value) || value < 1) {
    return DEFAULT_WEB_RESEARCH_MAX_SEARCHES;
  }
  return Math.min(value, MAX_WEB_RESEARCH_SEARCHES);
}

export interface AllowedDomains {
  domains: string[];
  /** Entradas descartadas, com o motivo — para o log. */
  rejected: string[];
}

/**
 * `WEB_RESEARCH_ALLOWED_DOMAINS`, separado por vírgula. Entrada inválida ou
 * repetida é descartada; acima de 64, as excedentes também. Lista vazia ou
 * toda inválida volta ao padrão: um typo nunca abre a pesquisa à web inteira.
 */
export function readWebResearchAllowedDomains(config: ConfigService): AllowedDomains {
  const raw = config.get<string | undefined>('WEB_RESEARCH_ALLOWED_DOMAINS')?.trim();
  if (!raw) return { domains: [...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS], rejected: [] };

  const domains: string[] = [];
  const rejected: string[] = [];
  for (const entry of raw.split(',')) {
    const domain = entry.trim().toLowerCase().replace(/\/$/, '');
    if (!domain) continue;
    if (!HOSTNAME.test(domain)) rejected.push(`${domain} (não é um hostname simples)`);
    else if (domains.includes(domain)) rejected.push(`${domain} (repetido)`);
    else if (domains.length >= MAX_ALLOWED_DOMAINS) rejected.push(`${domain} (acima de 64)`);
    else domains.push(domain);
  }

  if (domains.length === 0) {
    return {
      domains: [...DEFAULT_WEB_RESEARCH_ALLOWED_DOMAINS],
      rejected: [...rejected, 'lista sem domínio válido: usando a padrão'],
    };
  }
  return { domains, rejected };
}

/** O host é um dos domínios da lista ou subdomínio de um deles. */
export function isAllowedHost(host: string, domains: readonly string[]): boolean {
  const normalized = host.toLowerCase();
  return domains.some((domain) => normalized === domain || normalized.endsWith(`.${domain}`));
}
