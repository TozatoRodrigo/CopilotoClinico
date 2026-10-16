import type { MailContent, MailTemplateName } from './mail-templates';

/**
 * CC-015 — quem entrega a mensagem. O MailService escolhe o template, valida o
 * destinatário, mede, registra e engole a falha; o transporte só entrega, e
 * pode lançar à vontade.
 */

export type MailChannel = 'smtp' | 'log';

export interface OutgoingMail extends MailContent {
  /** Um destinatário só, já validado pelo MailService. */
  to: string;
  template: MailTemplateName;
}

export interface MailDelivery {
  /** Message-ID devolvido pelo provedor, para achar o envio no painel dele. */
  messageId: string | null;
}

export interface MailTransport {
  readonly channel: MailChannel;
  deliver(mail: OutgoingMail): Promise<MailDelivery>;
}

/**
 * Sem SMTP configurado: não entrega nada. O MailService registra a linha
 * `MAIL_LOGGED` (INFO), como o notificador por log da mentoria, e quem pediu
 * o envio segue normalmente.
 */
export class LogOnlyMailTransport implements MailTransport {
  readonly channel = 'log' as const;

  async deliver(): Promise<MailDelivery> {
    return { messageId: null };
  }
}
