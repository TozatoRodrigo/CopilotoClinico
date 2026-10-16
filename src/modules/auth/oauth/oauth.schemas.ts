import { z } from 'zod';
import { loginSchema, registerSchema } from '../schemas/auth.schemas';
import { oauthProviderValues } from '../../../shared/contracts/oauth';

export const oauthProviderSchema = z.enum(oauthProviderValues);

/** Conta nova pelo login social: mesmas regras de CRM e nome do cadastro. */
export const oauthSignupSchema = registerSchema.pick({ crmUf: true, crmNumber: true, name: true });

/** Vínculo com conta existente: a senha da conta, como no login. */
export const oauthLinkSchema = loginSchema.pick({ password: true });

export type OAuthSignupInput = z.infer<typeof oauthSignupSchema>;
export type OAuthLinkInput = z.infer<typeof oauthLinkSchema>;

/** Query do callback. Tudo opcional: o provedor manda `code` ou `error`. */
export const oauthCallbackQuerySchema = z
  .object({
    code: z.string().max(4096).optional(),
    state: z.string().max(512).optional(),
    error: z.string().max(256).optional(),
  })
  .passthrough();

export type OAuthCallbackQuery = z.infer<typeof oauthCallbackQuerySchema>;
