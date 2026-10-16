import { createTransport } from 'nodemailer';
import type { SmtpSettings } from './mail.settings';
import type { MailDelivery, MailTransport, OutgoingMail } from './mail.transport';

export interface SmtpTimeouts {
  connectionMs: number;
  greetingMs: number;
  socketMs: number;
  dnsMs: number;
}

/**
 * Prazos curtos: o envio é direto, dentro do fluxo que pediu, então um
 * provedor lento não pode prender a requisição. O MailService ainda corta
 * tudo no seu próprio teto (MAIL_SEND_TIMEOUT_MS). Os padrões do nodemailer
 * vão de 30 s a 10 min.
 */
export const DEFAULT_SMTP_TIMEOUTS: SmtpTimeouts = {
  connectionMs: 5_000,
  greetingMs: 5_000,
  socketMs: 10_000,
  dnsMs: 5_000,
};

/**
 * CC-015 — entrega por SMTP com o nodemailer: serve para qualquer provedor
 * (SES, Resend, Postmark, Brevo) só trocando host, porta e credencial.
 *
 * Sem pool: o volume é de poucos e-mails por dia, e uma conexão por envio não
 * deixa socket parado aberto contra o provedor.
 */
export class SmtpMailTransport implements MailTransport {
  readonly channel = 'smtp' as const;
  private readonly mailer: ReturnType<typeof createSmtpMailer>;

  constructor(
    private readonly settings: SmtpSettings,
    timeouts: SmtpTimeouts = DEFAULT_SMTP_TIMEOUTS,
  ) {
    this.mailer = createSmtpMailer(settings, timeouts);
  }

  async deliver(mail: OutgoingMail): Promise<MailDelivery> {
    const info = await this.mailer.sendMail({
      from: this.settings.from,
      // Endereço estruturado: o nodemailer não precisa interpretar o texto.
      to: [{ name: '', address: mail.to }],
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return { messageId: info.messageId || null };
  }
}

function createSmtpMailer(settings: SmtpSettings, timeouts: SmtpTimeouts) {
  return createTransport({
    host: settings.host,
    port: settings.port,
    secure: settings.secure,
    // Com credencial, exige STARTTLS: a senha nunca trafega em texto puro. Sem
    // credencial (Mailpit/MailHog local), segue o que o servidor oferecer.
    requireTLS: !settings.secure && settings.auth !== null,
    auth: settings.auth ?? undefined,
    connectionTimeout: timeouts.connectionMs,
    greetingTimeout: timeouts.greetingMs,
    socketTimeout: timeouts.socketMs,
    dnsTimeout: timeouts.dnsMs,
    // Nenhum template anexa arquivo ou URL; fecha a porta por garantia.
    disableFileAccess: true,
    disableUrlAccess: true,
    logger: false,
  });
}
