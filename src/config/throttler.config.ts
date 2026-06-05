import { ThrottlerModule, ThrottlerOptions } from '@nestjs/throttler';

interface ThrottlerObjectConfig {
  throttlers: ThrottlerOptions[];
}

const shortThrottler: ThrottlerOptions = {
  name: 'short',
  ttl: Number(process.env.THROTTLER_TTL ?? 60000),
  limit: Number(process.env.THROTTLER_LIMIT ?? 100),
};

const authThrottler: ThrottlerOptions = {
  name: 'auth',
  ttl: 60000,
  limit: 5,
};

export const throttlerConfig: ThrottlerObjectConfig = {
  throttlers: [shortThrottler, authThrottler],
};

export const ThrottlerConfigModule = ThrottlerModule.forRoot({
  throttlers: [shortThrottler, authThrottler],
});
