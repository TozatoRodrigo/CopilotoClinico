import { z } from 'zod';
import { AI_CALL_REPORT_PERIODS } from '../../shared/contracts/ai-calls';
import { FORWARDED_REQUEST_ID } from '../../shared/request-context/request-context';

/** CC-004 — período do painel de `ai_calls`; sem parâmetro, 7 dias. */
export const aiCallReportQuerySchema = z.object({
  period: z.enum(AI_CALL_REPORT_PERIODS).default('7d'),
});

export type AiCallReportQuery = z.infer<typeof aiCallReportQuerySchema>;

/** Mesma forma que a API aceita em `x-request-id`: o resto nunca foi gravado. */
export const aiCallRequestIdSchema = z
  .string()
  .regex(
    FORWARDED_REQUEST_ID,
    'requestId deve ter de 8 a 64 caracteres: letras, números, ".", "_" ou "-"',
  );
