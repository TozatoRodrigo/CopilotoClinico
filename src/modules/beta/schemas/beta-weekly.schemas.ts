import { z } from 'zod';

/**
 * CC-705 — `?week=` do painel semanal: uma data de calendário (`2026-10-12`).
 * Qualquer dia vale pela semana que o contém; sem parâmetro, a semana
 * corrente. Semana futura é recusada pelo serviço (400).
 */
export const weeklyQuerySchema = z.object({
  week: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'week deve ser uma data no formato AAAA-MM-DD')
    // O Zod roda o refine mesmo quando o regex falha: a checagem não pode lançar.
    .refine((value) => {
      const [year, month, day] = value.split('-').map(Number);
      const date = new Date(Date.UTC(year ?? NaN, (month ?? NaN) - 1, day ?? NaN));
      return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
    }, 'week deve ser uma data válida')
    .optional(),
});

export type WeeklyQuery = z.infer<typeof weeklyQuerySchema>;
