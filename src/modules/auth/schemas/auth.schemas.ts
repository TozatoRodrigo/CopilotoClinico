import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email(),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one digit')
    .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character'),
  crmUf: z
    .string()
    .length(2)
    .regex(/^[A-Z]{2}$/, 'CRM UF must be 2 uppercase letters'),
  crmNumber: z.string().min(1, 'CRM number is required'),
  name: z.string().min(1).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export const mfaEnableSchema = z.object({
  totpCode: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits'),
});

export const mfaVerifySchema = z.object({
  mfaToken: z.string().min(1, 'mfaToken is required'),
  code: z.string().min(1, 'code is required'),
});

export const mfaDisableSchema = z.object({
  totpCode: z
    .string()
    .length(6)
    .regex(/^\d{6}$/, 'TOTP code must be exactly 6 digits'),
});

export const logoutSchema = z.object({
  refreshToken: z.string().min(1).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
export type LogoutInput = z.infer<typeof logoutSchema>;
export type MfaEnableInput = z.infer<typeof mfaEnableSchema>;
export type MfaVerifyInput = z.infer<typeof mfaVerifySchema>;
export type MfaDisableInput = z.infer<typeof mfaDisableSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200).optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
