import type { ResultTone } from '@clinical-tools/tone';
import type { Tone } from '@/lib/tone';

/**
 * ADR-017, "Cores": o motor diz o significado, a tela escolhe o tom do design
 * system. Baixo risco fica cinza (verde é "conduta confirmada" no Copiloto),
 * risco intermediário fica laranja ("muda a conduta") e alto risco, vermelho.
 */
export const RESULT_TONE: Record<ResultTone, Tone> = {
  neutral: 'gray',
  attention: 'orange',
  critical: 'red',
};
