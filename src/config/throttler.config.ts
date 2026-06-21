import { ThrottlerModule, ThrottlerOptions } from '@nestjs/throttler';

interface ThrottlerObjectConfig {
  throttlers: ThrottlerOptions[];
}

const shortThrottler: ThrottlerOptions = {
  name: 'short',
  ttl: Number(process.env.THROTTLER_TTL ?? 60000),
  limit: Number(process.env.THROTTLER_LIMIT ?? 100),
};

// "auth" não é registrado como throttler global — é aplicado apenas nas rotas
// de autenticação via @Throttle({ short: { limit: 5 } }). Registrar ambos em
// forRoot fazia com que o limit de 5 req/60s batesse em TODOS os endpoints.

export const throttlerConfig: ThrottlerObjectConfig = {
  throttlers: [shortThrottler],
};

export const ThrottlerConfigModule = ThrottlerModule.forRoot({
  throttlers: [shortThrottler],
});
