import type { ConfigService } from '@nestjs/config';
import { readChoiceFlag } from '../../../config/feature-flag';

export const INTAKE_MODES = ['off', 'on'] as const;
export type IntakeMode = (typeof INTAKE_MODES)[number];

/**
 * ADR-014 — `COPILOT_INTAKE`: `on` lê o caso e pergunta antes do plano;
 * `off` (padrão) vai direto ao plano, como antes. Lida a cada caso, para
 * desligar sem redeploy; typo cai em `off`.
 */
export function readIntakeMode(config: ConfigService): IntakeMode {
  return readChoiceFlag(config, 'COPILOT_INTAKE', INTAKE_MODES, 'off');
}

/**
 * Teto da leitura do caso. Passou disso, o médico não espera: o caso segue
 * direto ao plano e a leitura que chegar depois é descartada.
 */
export const INTAKE_READING_TIMEOUT_MS = 20_000;

/**
 * Depois disso sem plano gravado, a análise iniciada pela conversa é dada como
 * perdida (processo reiniciado, chamada presa) e pode recomeçar. Acima do pior
 * caso de uma análise (entendimento, decisão, retry e verificação com fonte),
 * para não haver duas análises da mesma conversa ao mesmo tempo.
 */
export const INTAKE_ANALYSIS_STALE_MS = 6 * 60_000;
