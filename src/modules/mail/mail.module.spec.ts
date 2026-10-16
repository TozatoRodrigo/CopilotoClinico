import { afterEach, describe, expect, it, vi } from 'vitest';
import 'reflect-metadata';
import { Global, Logger, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { PrismaService } from '../../config/prisma.service';
import { MailModule } from './mail.module';
import { MailService } from './mail.service';

/** O PrismaModule real é global; aqui basta um substituto global. */
@Global()
@Module({ providers: [{ provide: PrismaService, useValue: {} }], exports: [PrismaService] })
class FakePrismaModule {}

async function compileWith(env: Record<string, string>) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }),
      FakePrismaModule,
      MailModule,
    ],
  }).compile();
  return moduleRef.get(MailService);
}

describe('MailModule', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('boots on the log channel when the environment has no SMTP', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const mail = await compileWith({ SMTP_HOST: '' });

    expect(mail.channel).toBe('log');
  });

  it('boots on the SMTP channel when the environment configures it', async () => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    const mail = await compileWith({
      SMTP_HOST: 'smtp-relay.brevo.com',
      SMTP_PORT: '587',
      SMTP_USER: 'conta@brevo',
      SMTP_PASSWORD: 'chave-smtp',
      SMTP_FROM: 'Copiloto Clínico <nao-responda@copiloto.com.br>',
      WEB_PUBLIC_URL: 'https://copiloto.servidortozato.cloud',
    });

    expect(mail.channel).toBe('smtp');
  });
});
