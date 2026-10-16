import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../config/feature-flag';

export const DEID_MODES = ['regex', 'model'] as const;
export type DeidMode = (typeof DEID_MODES)[number];

/**
 * CC-203 / ADR-020 — `DEID_MODE`: `regex` (padrão) é a máscara de sempre;
 * `model` soma o modelo local (serviço copiloto-deid) depois da regex. Lida a
 * cada texto, para ligar e desligar sem redeploy; typo cai em `regex`.
 */
export function readDeidMode(config: ConfigService): DeidMode {
  return readChoiceFlag(config, 'DEID_MODE', DEID_MODES, 'regex');
}

/** Rede interna do compose de produção; fora dele, `DEID_SERVICE_URL`. */
export const DEFAULT_DEID_SERVICE_URL = 'http://copiloto-deid:8000';

export function readDeidServiceUrl(config: ConfigService): string {
  const raw = config.get<string | undefined>('DEID_SERVICE_URL')?.trim();
  return (raw || DEFAULT_DEID_SERVICE_URL).replace(/\/+$/, '');
}

/**
 * Quanto o texto espera pelo modelo, a cada DEID_TIMEOUT_CHARS caracteres,
 * antes de seguir só com a regex. Medido em 15/10/2026 (ADR-020): relato de
 * ~1.000 caracteres com p95 de 270 ms em 1 CPU e 180 ms em 2; 1 s cobre a VPS
 * ocupada sem o médico perceber.
 */
export const DEFAULT_DEID_TIMEOUT_MS = 1000;

/**
 * O tempo do modelo cresce com o texto (~0,3 ms por caractere em 1 CPU): o
 * teto também. Relato de plantão fica no teto simples; o anexo de 20 mil
 * caracteres ganha 10 vezes ele, em vez de cair sempre na regex.
 */
export const DEID_TIMEOUT_CHARS = 2000;

/** Inteiro positivo; vazio, zero ou typo cai no padrão — nunca derruba a análise. */
export function readDeidTimeoutMs(config: ConfigService): number {
  const raw = config.get<string | number | undefined>('DEID_TIMEOUT_MS');
  const parsed = Number(raw);
  return raw !== undefined && raw !== '' && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : DEFAULT_DEID_TIMEOUT_MS;
}

/** O teto para um texto deste tamanho: DEID_TIMEOUT_MS a cada DEID_TIMEOUT_CHARS caracteres. */
export function deidTimeoutFor(config: ConfigService, textLength: number): number {
  return readDeidTimeoutMs(config) * Math.max(1, Math.ceil(textLength / DEID_TIMEOUT_CHARS));
}
