import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

import * as Sentry from '@sentry/node';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { runWithRequestContext } from '../../shared/request-context/request-context';
import {
  MAIL_SEND_TIMEOUT_MS,
  MailService,
  createMailRuntime,
  type MailRuntime,
} from './mail.service';
import {
  LogOnlyMailTransport,
  type MailDelivery,
  type MailTransport,
  type OutgoingMail,
} from './mail.transport';
import { SmtpMailTransport } from './smtp-mail.transport';

const ADDRESS = 'dra.fulana@hospital.com.br';
const MASKED = 'd***@h***.com.br';
const REQUEST_ID = '6a1f0e2d-3c4b-4a5e-8f7d-1b2c3d4e5f60';

/** Transporte falso: grava o que recebeu e responde o que o teste mandar. */
class FakeTransport implements MailTransport {
  readonly delivered: OutgoingMail[] = [];
  constructor(
    readonly channel: 'smtp' | 'log',
    private readonly respond: (mail: OutgoingMail) => Promise<MailDelivery> = async () => ({
      messageId: '<abc@copiloto>',
    }),
  ) {}

  async deliver(mail: OutgoingMail): Promise<MailDelivery> {
    this.delivered.push(mail);
    return this.respond(mail);
  }
}

function serviceWith(transport: MailTransport, timeoutMs = MAIL_SEND_TIMEOUT_MS) {
  const runtime: MailRuntime = {
    transport,
    webPublicUrl: 'https://copiloto.servidortozato.cloud',
    timeoutMs,
  };
  return new MailService(runtime);
}

const mentoringRequest = {
  to: ADDRESS,
  template: { name: 'mentoring_new_request', params: { path: '/mentoria/req-1' } },
} as const;

describe('MailService', () => {
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    vi.mocked(Sentry.captureMessage).mockClear();
  });

  afterEach(() => vi.restoreAllMocks());

  const lines = (spy: { mock: { calls: unknown[][] } }) =>
    spy.mock.calls.map((call) => String(call[0]));

  describe('with a working provider', () => {
    it('delivers the rendered template and logs MAIL_SENT with the masked address', async () => {
      const transport = new FakeTransport('smtp');

      const result = await serviceWith(transport).send(mentoringRequest);

      expect(result).toEqual({ status: 'sent', channel: 'smtp', messageId: '<abc@copiloto>' });
      expect(transport.delivered).toHaveLength(1);
      expect(transport.delivered[0]).toMatchObject({
        to: ADDRESS,
        template: 'mentoring_new_request',
        subject: 'Novo pedido de mentoria no Copiloto Clínico',
      });
      expect(transport.delivered[0]?.text).toContain(
        'https://copiloto.servidortozato.cloud/mentoria/req-1',
      );

      const [line] = lines(info);
      expect(line).toMatch(
        new RegExp(
          `^MAIL_SENT template=mentoring_new_request channel=smtp to=${escape(MASKED)} ` +
            'durationMs=\\d+ messageId=<abc@copiloto>$',
        ),
      );
      expect(line).not.toContain(ADDRESS);
    });

    it('adds the requestId when the send happens inside a request', async () => {
      const service = serviceWith(new FakeTransport('smtp'));

      await runWithRequestContext(
        { requestId: REQUEST_ID, physicianId: null, encounterId: null },
        () => service.send(mentoringRequest),
      );

      expect(lines(info)[0]).toMatch(new RegExp(`requestId=${REQUEST_ID}$`));
    });

    it('trims the recipient before delivering', async () => {
      const transport = new FakeTransport('smtp');

      await serviceWith(transport).send({ ...mentoringRequest, to: `  ${ADDRESS} ` });

      expect(transport.delivered[0]?.to).toBe(ADDRESS);
    });
  });

  describe('when the provider fails', () => {
    it('never rejects: returns failed and logs a WARN with codes only', async () => {
      const providerError = Object.assign(
        new Error(`Can't send mail - all recipients were rejected: 550 5.1.1 <${ADDRESS}>`),
        { code: 'EENVELOPE', responseCode: 550, command: 'RCPT TO' },
      );
      const transport = new FakeTransport('smtp', () => Promise.reject(providerError));

      const result = await serviceWith(transport).send(mentoringRequest);

      expect(result).toEqual({
        status: 'failed',
        channel: 'smtp',
        reason: 'EENVELOPE',
        responseCode: 550,
      });
      const [line] = lines(warn);
      expect(line).toMatch(
        new RegExp(
          `^MAIL_SEND_FAILED template=mentoring_new_request channel=smtp to=${escape(MASKED)} ` +
            'reason=EENVELOPE responseCode=550 durationMs=\\d+$',
        ),
      );
      expect(info).not.toHaveBeenCalled();
    });

    it('keeps the e-mail content, the address and the provider message out of every log and of Sentry', async () => {
      const transport = new FakeTransport('smtp', (mail) =>
        Promise.reject(new Error(`${mail.subject} ${mail.text} <${mail.to}>`)),
      );

      await serviceWith(transport).send(mentoringRequest);

      const everything = JSON.stringify([
        ...info.mock.calls,
        ...warn.mock.calls,
        ...vi.mocked(Sentry.captureMessage).mock.calls,
      ]);
      expect(everything).not.toContain(ADDRESS);
      expect(everything).not.toContain('fulana');
      expect(everything).not.toContain('Novo pedido de mentoria');
      expect(everything).not.toContain('/mentoria/req-1');
      expect(lines(warn)[0]).toContain('reason=Error');
    });

    it('reports the failure to Sentry as a warning with tags only', async () => {
      const transport = new FakeTransport('smtp', () =>
        Promise.reject(Object.assign(new Error('auth'), { code: 'EAUTH', responseCode: 535 })),
      );

      await serviceWith(transport).send(mentoringRequest);

      expect(Sentry.captureMessage).toHaveBeenCalledWith('MAIL_SEND_FAILED', {
        level: 'warning',
        tags: {
          component: 'mail',
          template: 'mentoring_new_request',
          channel: 'smtp',
          reason: 'EAUTH',
        },
      });
    });

    it('gives up after the timeout instead of holding the caller', async () => {
      const transport = new FakeTransport('smtp', () => new Promise<MailDelivery>(() => {}));

      const result = await serviceWith(transport, 20).send(mentoringRequest);

      expect(result).toMatchObject({ status: 'failed', reason: 'ETIMEDOUT', responseCode: null });
      expect(lines(warn)[0]).toContain('reason=ETIMEDOUT');
    });

    it('does not trust an error code that could carry an address', async () => {
      const transport = new FakeTransport('smtp', () =>
        Promise.reject({ code: `550 <${ADDRESS}>`, responseCode: '550' }),
      );

      const result = await serviceWith(transport).send(mentoringRequest);

      expect(result).toMatchObject({ reason: 'unknown', responseCode: null });
    });

    it('refuses an invalid recipient without calling the provider', async () => {
      const transport = new FakeTransport('smtp');

      const result = await serviceWith(transport).send({
        ...mentoringRequest,
        to: 'a@x.com, b@y.com',
      });

      expect(result).toMatchObject({ status: 'failed', reason: 'invalid_recipient' });
      expect(transport.delivered).toHaveLength(0);
    });

    it('resolves even with a null address, so `void mail.send(...)` is safe', async () => {
      const transport = new FakeTransport('smtp');

      const result = await serviceWith(transport).send({
        ...mentoringRequest,
        to: null as unknown as string,
      });

      expect(result).toMatchObject({ status: 'failed', reason: 'invalid_recipient' });
      expect(lines(warn)[0]).toContain('to=***');
      expect(transport.delivered).toHaveLength(0);
    });

    it('refuses a template with an unsafe link without calling the provider', async () => {
      const transport = new FakeTransport('smtp');

      const result = await serviceWith(transport).send({
        to: ADDRESS,
        template: { name: 'mentoring_answer', params: { path: 'https://phishing.example/x' } },
      });

      expect(result).toMatchObject({ status: 'failed', reason: 'invalid_template_params' });
      expect(transport.delivered).toHaveLength(0);
    });
  });

  describe('without SMTP', () => {
    it('logs MAIL_LOGGED at INFO and reports logged', async () => {
      const result = await serviceWith(new LogOnlyMailTransport()).send(mentoringRequest);

      expect(result).toEqual({ status: 'logged', channel: 'log' });
      expect(lines(info)).toEqual([
        `MAIL_LOGGED template=mentoring_new_request channel=log to=${MASKED}`,
      ]);
      expect(warn).not.toHaveBeenCalled();
      expect(Sentry.captureMessage).not.toHaveBeenCalled();
    });
  });
});

describe('createMailRuntime', () => {
  let info: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    info = vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it('uses the log transport when SMTP is not configured', () => {
    const runtime = createMailRuntime(new ConfigService({}));

    expect(runtime.transport).toBeInstanceOf(LogOnlyMailTransport);
    expect(runtime.timeoutMs).toBe(MAIL_SEND_TIMEOUT_MS);
    expect(info).toHaveBeenCalledWith('MAIL_TRANSPORT channel=log reason=smtp_not_configured');
    expect(warn).not.toHaveBeenCalled();
  });

  it('uses SMTP with a complete configuration and logs no credential', () => {
    const runtime = createMailRuntime(
      new ConfigService({
        SMTP_HOST: 'email-smtp.sa-east-1.amazonaws.com',
        SMTP_PORT: '587',
        SMTP_USER: 'AKIAEXEMPLO',
        SMTP_PASSWORD: 'segredo-do-ses',
        SMTP_FROM: 'Copiloto <nao-responda@copiloto.com.br>',
        WEB_PUBLIC_URL: 'https://copiloto.servidortozato.cloud',
      }),
    );

    expect(runtime.transport).toBeInstanceOf(SmtpMailTransport);
    expect(runtime.webPublicUrl).toBe('https://copiloto.servidortozato.cloud');
    expect(info).toHaveBeenCalledWith(
      'MAIL_TRANSPORT channel=smtp host=email-smtp.sa-east-1.amazonaws.com port=587 ' +
        'secure=false auth=on',
    );
    expect(JSON.stringify(info.mock.calls)).not.toMatch(/AKIAEXEMPLO|segredo-do-ses/);
  });

  it('warns with the variable names, never the values, and falls back to the log', () => {
    const runtime = createMailRuntime(
      new ConfigService({
        SMTP_HOST: 'smtp.exemplo.com',
        SMTP_USER: 'usuario-secreto',
        SMTP_FROM: 'remetente-invalido',
        WEB_PUBLIC_URL: 'https://copiloto.servidortozato.cloud',
      }),
    );

    expect(runtime.transport).toBeInstanceOf(LogOnlyMailTransport);
    expect(warn).toHaveBeenCalledWith(
      'MAIL_SMTP_CONFIG_INVALID invalid=SMTP_FROM,SMTP_USER/SMTP_PASSWORD channel=log: ' +
        'nenhum e-mail sai até corrigir',
    );
    expect(JSON.stringify(warn.mock.calls)).not.toMatch(/usuario-secreto|remetente-invalido/);
  });
});

function escape(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
