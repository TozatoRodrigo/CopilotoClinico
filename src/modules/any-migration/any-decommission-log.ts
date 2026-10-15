import type { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import type { AuditService } from '../audit/audit.service';

/**
 * CC-336 — registro, na trilha de auditoria do Copiloto (cadeia de hash,
 * ADR-015), de cada passo do desligamento do ANY que acontece fora daqui:
 * apagar os dados do Supabase, desligar o Netlify, apagar o arquivo de envio.
 * É o "com registro" do critério de aceite: data, quem fez, o que foi
 * conferido (contagens do SQL de verificação) e uma nota.
 */

export const ANY_DECOMMISSION_AUDIT_ACTION = 'ANY_DECOMMISSION_STEP';

export const ANY_DECOMMISSION_STEPS = [
  /** CC-335: arquivo de envio (com e-mails) apagado depois do envio. */
  'arquivo_envio_apagado',
  /** CC-336: `_redirects` publicado no site do ANY. */
  'redirecionamento_publicado',
  /** CC-336: dados de usuário do Supabase do ANY apagados e conferidos. */
  'dados_supabase_apagados',
  /** CC-336: projeto do ANY desligado no Netlify (o redirecionamento continua). */
  'projeto_netlify_desligado',
] as const;

export type AnyDecommissionStep = (typeof ANY_DECOMMISSION_STEPS)[number];

/** `auth.users=0,public.pageviews=0` — o resultado do SQL de verificação. */
export function parseCounts(raw: string): Record<string, number> | null {
  const counts: Record<string, number> = {};
  for (const pair of raw.split(',').map((item) => item.trim())) {
    if (pair === '') continue;
    const match = /^([a-z_][a-z0-9_.]*)=(\d+)$/i.exec(pair);
    if (!match?.[1] || !match[2]) return null;
    counts[match[1]] = Number(match[2]);
  }
  return Object.keys(counts).length > 0 ? counts : null;
}

export const anyDecommissionInputSchema = z
  .object({
    step: z.enum(ANY_DECOMMISSION_STEPS),
    adminEmail: z.string().trim().toLowerCase().email(),
    note: z
      .string()
      .trim()
      .min(3)
      .max(500)
      .refine((text) => !text.includes('@'), 'Sem e-mail na nota: ela vai para a trilha'),
    counts: z.record(z.string(), z.number().int().min(0)).optional(),
  })
  // Apagou e não conferiu não conta: o passo dos dados exige as contagens, e
  // todas zeradas.
  .refine(
    (input) =>
      input.step !== 'dados_supabase_apagados' ||
      (input.counts !== undefined && Object.values(input.counts).every((count) => count === 0)),
    { message: 'dados_supabase_apagados exige --contagens com tudo em 0', path: ['counts'] },
  );

export type AnyDecommissionInput = z.input<typeof anyDecommissionInputSchema>;

export interface AnyDecommissionDeps {
  prisma: { physician: Pick<PrismaClient['physician'], 'findFirst'> };
  audit: Pick<AuditService, 'log'>;
}

export class AnyDecommissionRefusedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnyDecommissionRefusedError';
  }
}

export async function recordAnyDecommissionStep(
  deps: AnyDecommissionDeps,
  rawInput: AnyDecommissionInput,
): Promise<{ auditId: string }> {
  const parsed = anyDecommissionInputSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new AnyDecommissionRefusedError(
      parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; '),
    );
  }
  const input = parsed.data;

  const admin = await deps.prisma.physician.findFirst({
    where: { email: { equals: input.adminEmail, mode: 'insensitive' }, role: 'ADMIN' },
    select: { id: true },
  });
  if (!admin) throw new AnyDecommissionRefusedError('Nenhuma conta ADMIN com o e-mail de --admin');

  const entry = await deps.audit.log({
    actorId: admin.id,
    action: ANY_DECOMMISSION_AUDIT_ACTION,
    entity: 'AnyApp',
    entityId: input.step,
    payload: {
      step: input.step,
      note: input.note,
      ...(input.counts ? { counts: input.counts } : {}),
    },
  });
  return { auditId: entry.id };
}
