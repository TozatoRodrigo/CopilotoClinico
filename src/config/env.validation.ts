import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  API_PREFIX: z.string().default('v1'),
  CORS_ORIGIN: z.string().min(1).default('http://localhost:3001'),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  AI_PROVIDER: z.enum(['openai', 'anthropic']).default('openai'),
  AI_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  AI_MODEL: z.string().min(1),
  AI_EMBEDDING_MODEL: z.string().min(1),
  AI_BASE_URL: z.string().url().optional(),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
});

export function validateEnv(config: Record<string, unknown>) {
  const result = envSchema.safeParse(config);
  if (!result.success) {
    throw new Error(`Invalid environment: ${result.error.message}`);
  }

  const env = result.data;
  if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY && !env.AI_API_KEY) {
    throw new Error('Invalid environment: OPENAI_API_KEY or AI_API_KEY is required');
  }
  if (env.AI_PROVIDER === 'anthropic' && !env.ANTHROPIC_API_KEY && !env.AI_API_KEY) {
    throw new Error('Invalid environment: ANTHROPIC_API_KEY or AI_API_KEY is required');
  }

  return env;
}
