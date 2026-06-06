import { describe, expect, it } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { ThrottlerBehindProxyGuard } from './shared/guards/throttler-behind-proxy.guard';

describe('AppModule', () => {
  it('registers throttling as a global guard', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? [];

    expect(providers).toContainEqual({
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    });
  });
});
