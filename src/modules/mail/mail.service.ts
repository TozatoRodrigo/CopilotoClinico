import { Inject, Injectable, Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import * as Sentry from '@sentry/node';
import { currentRequestContext } from '../../shared/request-context/request-context';
import { isValidMailAddress, maskMailAddress } from './mail-address';
import { renderMailTemplate, type MailTemplate } from './mail-templates';
import { readMailSettings } from './mail.settings';
import { LogOnlyMailTransport, type MailChannel, type MailTransport } from './mail.transport';
import { SmtpMailTransport } from './smtp-mail.transport';

/**
 * CC-015 — e-mail transacional.
 *
 * Contrato para quem chama:
 * - `send` NUNCA lança. Falha do provedor, prazo estourado, destinatário
 *   inválido ou template recusado viram `{ status: 'failed' }` e um WARN
 *   `MAIL_SEND_FAILED`; o fluxo que pediu o envio segue.
 * - Sem SMTP configurado, devolve `{ status: 'logged' }` e registra
 *   `MAIL_LOGGED` (INFO): em dev e em produção sem provedor, nada muda.
 * - O envio é direto, com teto de MAIL_SEND_TIMEOUT_MS. Quem não pode esperar
 *   esse teto (uma requisição do médico) chama sem `await`: `void
 *   mail.send(...)` é seguro, porque a promessa nunca rejeita.
 * - Corpo e assunto só por template (mail-templates.ts). O log leva template,
 *   canal, destinatário mascarado, código do erro e requestId; nunca assunto,
 *   corpo ou endereço completo.
 *
 * Fila: o BullMQ do projeto é o da inferência. Para poucos e-mails por dia,
 * um job por e-mail poria endereço e corpo no Redis (que guarda job falho por
 * 7 dias) em troca de retry; ainda não compensa. Se o volume crescer (convites
 * do beta em lote), a fila entra atrás desta mesma interface.
 */

/** Teto do envio inteiro: conexão, TLS, autenticação e entrega. */
export const MAIL_SEND_TIMEOUT_MS = 10_000;

export interface MailRequest {
  /** Um endereço só. Vários destinatários = vários envios (um não vê o outro). */
  to: string;
  template: MailTemplate;
}

export type MailSendResult =
  | { status: 'sent'; channel: 'smtp'; messageId: string | null }
  | { status: 'logged'; channel: 'log' }
  | {
      status: 'failed';
      channel: MailChannel;
      /** Código do erro (`EAUTH`, `ETIMEDOUT`, `invalid_recipient`...), nunca a mensagem. */
      reason: string;
      /** Código SMTP da recusa (ex.: 550), quando o provedor respondeu. */
      responseCode: number | null;
    };

export interface MailRuntime {
  transport: MailTransport;
  /** Base dos links nos templates (WEB_PUBLIC_URL). */
  webPublicUrl: string;
  timeoutMs: number;
}

export const MAIL_RUNTIME = Symbol('MAIL_RUNTIME');

/** Monta o transporte pela configuração do boot e registra qual canal ficou ativo. */
export function createMailRuntime(config: ConfigService): MailRuntime {
  const logger = new Logger(MailService.name);
  const settings = readMailSettings(config);

  if (settings.channel === 'smtp') {
    const { host, port, secure, auth } = settings.smtp;
    logger.log(
      `MAIL_TRANSPORT channel=smtp host=${host} port=${port} secure=${secure} ` +
        `auth=${auth ? 'on' : 'off'}`,
    );
    return {
      transport: new SmtpMailTransport(settings.smtp),
      webPublicUrl: settings.webPublicUrl,
      timeoutMs: MAIL_SEND_TIMEOUT_MS,
    };
  }

  if (settings.problems.length > 0) {
    logger.warn(
      `MAIL_SMTP_CONFIG_INVALID invalid=${settings.problems.join(',')} channel=log: ` +
        'nenhum e-mail sai até corrigir',
    );
  } else {
    logger.log('MAIL_TRANSPORT channel=log reason=smtp_not_configured');
  }
  return {
    transport: new LogOnlyMailTransport(),
    webPublicUrl: settings.webPublicUrl,
    timeoutMs: MAIL_SEND_TIMEOUT_MS,
  };
}

class MailTimeoutError extends Error {
  readonly code = 'ETIMEDOUT';
}

class InvalidRecipientError extends Error {
  readonly code = 'invalid_recipient';
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(@Inject(MAIL_RUNTIME) private readonly runtime: MailRuntime) {}

  /** Canal ativo: `log` quando não há SMTP configurado (ou está inválido). */
  get channel(): MailChannel {
    return this.runtime.transport.channel;
  }

  async send(request: MailRequest): Promise<MailSendResult> {
    const { transport, webPublicUrl, timeoutMs } = this.runtime;
    const channel = transport.channel;
    const template = request.template.name;
    // `void mail.send(...)` depende de a promessa nunca rejeitar: nada fora do
    // try pode lançar, nem um endereço nulo vindo do banco.
    const to = typeof request.to === 'string' ? request.to.trim() : '';
    const fields = `template=${template} channel=${channel} to=${maskMailAddress(to)}`;
    const startedAt = Date.now();

    try {
      if (!isValidMailAddress(to)) throw new InvalidRecipientError();
      const content = renderMailTemplate(request.template, { webPublicUrl });
      const delivery = await withTimeout(
        transport.deliver({ to, template, ...content }),
        timeoutMs,
      );

      if (channel === 'log') {
        this.logger.log(`MAIL_LOGGED ${fields}${requestIdField()}`);
        return { status: 'logged', channel };
      }
      this.logger.log(
        `MAIL_SENT ${fields} durationMs=${Date.now() - startedAt}` +
          `${delivery.messageId ? ` messageId=${delivery.messageId}` : ''}${requestIdField()}`,
      );
      return { status: 'sent', channel, messageId: delivery.messageId };
    } catch (error) {
      const { reason, responseCode } = describeFailure(error);
      this.logger.warn(
        `MAIL_SEND_FAILED ${fields} reason=${reason}` +
          `${responseCode !== null ? ` responseCode=${responseCode}` : ''}` +
          ` durationMs=${Date.now() - startedAt}${requestIdField()}`,
      );
      Sentry.captureMessage('MAIL_SEND_FAILED', {
        level: 'warning',
        tags: { component: 'mail', template, channel, reason },
      });
      return { status: 'failed', channel, reason, responseCode };
    }
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new MailTimeoutError()), timeoutMs);
  });
  // A entrega que perde a corrida continua em segundo plano; o race já
  // assinou a promessa, então uma rejeição tardia não fica sem tratamento.
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Código de erro com cara de constante; qualquer outra coisa pode ter endereço dentro. */
const ERROR_CODE = /^[A-Za-z][A-Za-z0-9_]{1,40}$/;

/**
 * Só o código do erro e o código SMTP. A mensagem do erro fica de fora: a do
 * provedor costuma repetir o destinatário ("550 <fulano@...>: user unknown").
 */
function describeFailure(error: unknown): { reason: string; responseCode: number | null } {
  if (typeof error !== 'object' || error === null) {
    return { reason: 'unknown', responseCode: null };
  }
  const { code, responseCode, name } = error as {
    code?: unknown;
    responseCode?: unknown;
    name?: unknown;
  };
  const reason =
    typeof code === 'string' && ERROR_CODE.test(code)
      ? code
      : typeof name === 'string' && ERROR_CODE.test(name)
        ? name
        : 'unknown';
  return {
    reason,
    responseCode:
      typeof responseCode === 'number' && Number.isInteger(responseCode) ? responseCode : null,
  };
}

function requestIdField(): string {
  const requestId = currentRequestContext()?.requestId;
  return requestId ? ` requestId=${requestId}` : '';
}
