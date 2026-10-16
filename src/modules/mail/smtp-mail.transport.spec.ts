import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@sentry/node', () => ({ captureMessage: vi.fn() }));

import { createServer, type AddressInfo, type Server, type Socket } from 'node:net';
import { Logger } from '@nestjs/common';
import { MailService } from './mail.service';
import type { SmtpSettings } from './mail.settings';
import { SmtpMailTransport, type SmtpTimeouts } from './smtp-mail.transport';

/**
 * O caminho SMTP de verdade, contra um servidor SMTP mínimo em 127.0.0.1:
 * prova que o nodemailer recebe as opções certas e que o que chega ao
 * provedor é o que o template montou. Sem rede externa.
 */

interface ReceivedMail {
  commands: string[];
  data: string;
}

interface FakeSmtpBehavior {
  /** Não manda o 220 de saudação: simula provedor pendurado. */
  silent?: boolean;
  /** Recusa o destinatário com 550, repetindo o endereço como provedores reais fazem. */
  rejectRecipient?: boolean;
}

interface FakeSmtp {
  port: number;
  received: ReceivedMail[];
  commands: string[];
  close(): Promise<void>;
}

async function startFakeSmtp(behavior: FakeSmtpBehavior = {}): Promise<FakeSmtp> {
  const received: ReceivedMail[] = [];
  const commands: string[] = [];
  const sockets = new Set<Socket>();

  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    if (behavior.silent) return;

    socket.setEncoding('utf8');
    socket.write('220 fake.smtp ESMTP\r\n');
    let buffer = '';
    let inData = false;
    let current: ReceivedMail = { commands: [], data: '' };

    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end === -1) return;
          current.data = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          received.push(current);
          socket.write('250 2.0.0 Ok: queued as FAKE1\r\n');
          continue;
        }
        const lineEnd = buffer.indexOf('\r\n');
        if (lineEnd === -1) return;
        const line = buffer.slice(0, lineEnd);
        buffer = buffer.slice(lineEnd + 2);
        commands.push(line);
        current.commands.push(line);

        const verb = (line.split(' ')[0] ?? '').toUpperCase();
        if (verb === 'EHLO') socket.write('250-fake.smtp\r\n250 8BITMIME\r\n');
        else if (verb === 'HELO') socket.write('250 fake.smtp\r\n');
        else if (verb === 'MAIL') socket.write('250 2.1.0 Ok\r\n');
        else if (verb === 'RCPT') {
          const address = /<([^>]*)>/.exec(line)?.[1] ?? '';
          socket.write(
            behavior.rejectRecipient
              ? `550 5.1.1 <${address}>: Recipient address rejected\r\n`
              : '250 2.1.5 Ok\r\n',
          );
        } else if (verb === 'DATA') {
          inData = true;
          socket.write('354 End data with <CR><LF>.<CR><LF>\r\n');
        } else if (verb === 'RSET') socket.write('250 Ok\r\n');
        else if (verb === 'QUIT') socket.end('221 2.0.0 Bye\r\n');
        else socket.write('502 5.5.2 Command not recognized\r\n');
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    port: (server.address() as AddressInfo).port,
    received,
    commands,
    close: () =>
      new Promise<void>((resolve) => {
        for (const socket of sockets) socket.destroy();
        server.close(() => resolve());
      }),
  };
}

const FAST: SmtpTimeouts = { connectionMs: 1_000, greetingMs: 300, socketMs: 1_000, dnsMs: 300 };
const ADDRESS = 'mentor.ripardo@hospital.com.br';

function settingsFor(port: number, overrides: Partial<SmtpSettings> = {}): SmtpSettings {
  return {
    host: '127.0.0.1',
    port,
    secure: false,
    auth: null,
    from: { name: 'Copiloto Clínico', address: 'nao-responda@copiloto.com.br' },
    ...overrides,
  };
}

function serviceFor(transport: SmtpMailTransport) {
  return new MailService({
    transport,
    webPublicUrl: 'https://copiloto.servidortozato.cloud',
    timeoutMs: 5_000,
  });
}

describe('SmtpMailTransport (fake SMTP server)', () => {
  let smtp: FakeSmtp | undefined;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    warn = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await smtp?.close();
    smtp = undefined;
  });

  it('delivers the template to the provider with sender, recipient and both bodies', async () => {
    smtp = await startFakeSmtp();
    const service = serviceFor(new SmtpMailTransport(settingsFor(smtp.port), FAST));

    const result = await service.send({
      to: ADDRESS,
      template: { name: 'mentoring_new_request', params: { path: '/mentoria/req-42' } },
    });

    expect(result).toMatchObject({ status: 'sent', channel: 'smtp' });
    expect(result.status === 'sent' && result.messageId).toMatch(/^<.+@copiloto\.com\.br>$/);
    expect(smtp.received).toHaveLength(1);
    const [mail] = smtp.received as [ReceivedMail];
    expect(mail.commands).toContain('MAIL FROM:<nao-responda@copiloto.com.br>');
    expect(mail.commands).toContain(`RCPT TO:<${ADDRESS}>`);
    expect(mail.data).toMatch(/^Subject: .+$/m);
    expect(mail.data).toMatch(/^To: mentor\.ripardo@hospital\.com\.br$/m);
    expect(mail.data).toContain('Content-Type: text/plain; charset=utf-8');
    expect(mail.data).toContain('Content-Type: text/html; charset=utf-8');
    expect(mail.data).toContain('https://copiloto.servidortozato.cloud/mentoria/req-42');
  });

  it('turns a 550 from the provider into a WARN with the code, not the address', async () => {
    smtp = await startFakeSmtp({ rejectRecipient: true });
    const service = serviceFor(new SmtpMailTransport(settingsFor(smtp.port), FAST));

    const result = await service.send({
      to: ADDRESS,
      template: { name: 'test', params: { sentAt: new Date() } },
    });

    expect(result).toEqual({
      status: 'failed',
      channel: 'smtp',
      reason: 'EENVELOPE',
      responseCode: 550,
    });
    expect(smtp.received).toHaveLength(0);
    const line = String(warn.mock.calls[0]?.[0]);
    expect(line).toContain('MAIL_SEND_FAILED template=test channel=smtp to=m***@h***.com.br');
    expect(line).not.toContain('ripardo');
  });

  it('times out on a provider that never greets', async () => {
    smtp = await startFakeSmtp({ silent: true });
    const service = serviceFor(new SmtpMailTransport(settingsFor(smtp.port), FAST));

    const result = await service.send({
      to: ADDRESS,
      template: { name: 'test', params: { sentAt: new Date() } },
    });

    expect(result).toMatchObject({ status: 'failed', reason: 'ETIMEDOUT' });
  });

  it('never sends the password over a connection without TLS', async () => {
    smtp = await startFakeSmtp();
    const transport = new SmtpMailTransport(
      settingsFor(smtp.port, { auth: { user: 'usuario', pass: 'senha-do-provedor' } }),
      FAST,
    );

    const result = await serviceFor(transport).send({
      to: ADDRESS,
      template: { name: 'test', params: { sentAt: new Date() } },
    });

    expect(result).toMatchObject({ status: 'failed', channel: 'smtp', reason: 'ETLS' });
    expect(smtp.commands.some((command) => command.toUpperCase().startsWith('AUTH'))).toBe(false);
    expect(smtp.received).toHaveLength(0);
  });
});
