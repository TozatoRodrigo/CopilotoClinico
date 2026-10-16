import { describe, expect, it } from 'vitest';
import { APP_GUARD } from '@nestjs/core';
import { MODULE_METADATA } from '@nestjs/common/constants';
import { AppModule } from './app.module';
import { ThrottlerBehindProxyGuard } from './shared/guards/throttler-behind-proxy.guard';
import { DeidModule } from './modules/deid/deid.module';

describe('AppModule', () => {
  it('registers throttling as a global guard', () => {
    const providers = Reflect.getMetadata(MODULE_METADATA.PROVIDERS, AppModule) ?? [];

    expect(providers).toContainEqual({
      provide: APP_GUARD,
      useClass: ThrottlerBehindProxyGuard,
    });
  });

  // CC-203 — sem ele, os serviços do caso não sobem (a de-identificação é obrigatória).
  it('registers the de-identification module', () => {
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, AppModule) ?? [];

    expect(imports).toContain(DeidModule);
  });
});
