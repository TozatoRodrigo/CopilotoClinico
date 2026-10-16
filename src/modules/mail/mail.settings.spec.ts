import { describe, expect, it } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { readMailSettings } from './mail.settings';

const COMPLETE = {
  SMTP_HOST: 'smtp.resend.com',
  SMTP_PORT: '587',
  SMTP_USER: 'resend',
  SMTP_PASSWORD: 're_segredo',
  SMTP_FROM: 'Copiloto Clínico <nao-responda@copiloto.com.br>',
  WEB_PUBLIC_URL: 'https://copiloto.servidortozato.cloud/',
};

function settings(env: Record<string, string | undefined>) {
  return readMailSettings(new ConfigService(env));
}

describe('readMailSettings', () => {
  it('falls back to the log channel, with no problem, when SMTP_HOST is absent or empty', () => {
    expect(settings({})).toEqual({
      channel: 'log',
      problems: [],
      webPublicUrl: 'http://localhost:3001',
    });
    expect(settings({ SMTP_HOST: '  ', SMTP_FROM: 'x' })).toMatchObject({
      channel: 'log',
      problems: [],
    });
  });

  it('builds the SMTP settings from a complete configuration', () => {
    expect(settings(COMPLETE)).toEqual({
      channel: 'smtp',
      smtp: {
        host: 'smtp.resend.com',
        port: 587,
        secure: false,
        auth: { user: 'resend', pass: 're_segredo' },
        from: { name: 'Copiloto Clínico', address: 'nao-responda@copiloto.com.br' },
      },
      webPublicUrl: 'https://copiloto.servidortozato.cloud',
    });
  });

  it('defaults to port 587 and turns TLS-from-connect on for port 465', () => {
    const { SMTP_PORT: _port, ...withoutPort } = COMPLETE;
    expect(settings(withoutPort)).toMatchObject({ smtp: { port: 587, secure: false } });
    expect(settings({ ...COMPLETE, SMTP_PORT: '465' })).toMatchObject({
      smtp: { port: 465, secure: true },
    });
  });

  it('lets SMTP_SECURE override the port default, ignoring typos', () => {
    expect(settings({ ...COMPLETE, SMTP_PORT: '2465', SMTP_SECURE: 'true' })).toMatchObject({
      smtp: { secure: true },
    });
    expect(settings({ ...COMPLETE, SMTP_PORT: '465', SMTP_SECURE: 'false' })).toMatchObject({
      smtp: { secure: false },
    });
    expect(settings({ ...COMPLETE, SMTP_PORT: '587', SMTP_SECURE: 'talvez' })).toMatchObject({
      smtp: { secure: false },
    });
  });

  it('accepts a server without authentication (local Mailpit)', () => {
    const { SMTP_USER: _u, SMTP_PASSWORD: _p, ...withoutAuth } = COMPLETE;
    expect(settings(withoutAuth)).toMatchObject({ channel: 'smtp', smtp: { auth: null } });
  });

  it('reports each invalid variable by name and stays on the log channel', () => {
    const result = settings({
      SMTP_HOST: 'smtp.exemplo.com',
      SMTP_PORT: '99999',
      SMTP_USER: 'usuario',
      SMTP_FROM: 'sem-endereco',
      WEB_PUBLIC_URL: 'ftp://copiloto',
    });

    expect(result).toEqual({
      channel: 'log',
      problems: ['SMTP_PORT', 'SMTP_FROM', 'SMTP_USER/SMTP_PASSWORD', 'WEB_PUBLIC_URL'],
      webPublicUrl: 'http://localhost:3001',
    });
  });

  it('requires WEB_PUBLIC_URL with SMTP, so links never go out broken', () => {
    const { WEB_PUBLIC_URL: _url, ...withoutUrl } = COMPLETE;
    expect(settings(withoutUrl)).toMatchObject({ channel: 'log', problems: ['WEB_PUBLIC_URL'] });
    expect(settings({ ...COMPLETE, WEB_PUBLIC_URL: 'https://x.com/?next=/a' })).toMatchObject({
      problems: ['WEB_PUBLIC_URL'],
    });
  });

  it('refuses a non-numeric port', () => {
    expect(settings({ ...COMPLETE, SMTP_PORT: '587abc' })).toMatchObject({
      problems: ['SMTP_PORT'],
    });
  });

  it('keeps a base path and drops the trailing slash of WEB_PUBLIC_URL', () => {
    expect(settings({ ...COMPLETE, WEB_PUBLIC_URL: 'https://x.com/app//' })).toMatchObject({
      webPublicUrl: 'https://x.com/app',
    });
  });
});
