import { Injectable, Logger } from '@nestjs/common';

/**
 * CC-707 — aviso aos mentores (pedido novo) e ao médico (resposta pronta).
 *
 * O projeto ainda não envia e-mail: não há provedor nem SMTP configurado. Esta
 * interface é o ponto de troca; a implementação padrão só registra o evento
 * no log, e no modo concierge a equipe acompanha o painel e a fila. Para
 * ligar o e-mail, implemente `MentoringNotifier` com o provedor escolhido e
 * troque o provider `MENTORING_NOTIFIER` em mentoring.module.ts.
 *
 * Regras para qualquer implementação:
 * - o aviso leva só o link (`path`, relativo ao web), nunca o texto do caso:
 *   e-mail sai da trilha de auditoria, não é apagado no pedido de eliminação
 *   (LGPD) e a máscara por padrões não pega nome de paciente;
 * - falhar não pode desfazer o pedido nem a resposta: quem chama já captura o
 *   erro e registra `MENTORING_NOTIFY_FAILED`.
 *
 * O médico também é avisado no próprio app (GET /mentoring/notifications),
 * independentemente deste notificador.
 */

export interface MentoringRecipient {
  physicianId: string;
  email: string;
  name: string | null;
}

export interface NewMentoringRequestNotice {
  requestId: string;
  recipients: MentoringRecipient[];
  /** Tela do mentor com o pedido, relativa ao web (ex.: `/mentoria/<id>`). */
  path: string;
}

export interface MentoringAnswerNotice {
  requestId: string;
  encounterId: string;
  recipient: MentoringRecipient;
  /** O caso, onde a resposta aparece (ex.: `/encounters/<id>`). */
  path: string;
}

export interface MentoringNotifier {
  notifyNewRequest(notice: NewMentoringRequestNotice): Promise<void>;
  notifyAnswer(notice: MentoringAnswerNotice): Promise<void>;
}

export const MENTORING_NOTIFIER = Symbol('MENTORING_NOTIFIER');

/**
 * Implementação padrão: uma linha de log por aviso, com ids e contagem. Sem
 * e-mail nem nome (dado pessoal da equipe e do médico).
 */
@Injectable()
export class LogMentoringNotifier implements MentoringNotifier {
  private readonly logger = new Logger('MentoringNotifier');

  async notifyNewRequest(notice: NewMentoringRequestNotice): Promise<void> {
    this.logger.log(
      `MENTORING_NOTIFY event=new_request requestId=${notice.requestId} ` +
        `recipients=${notice.recipients.length} channel=log`,
    );
  }

  async notifyAnswer(notice: MentoringAnswerNotice): Promise<void> {
    this.logger.log(
      `MENTORING_NOTIFY event=answer requestId=${notice.requestId} ` +
        `encounterId=${notice.encounterId} channel=log`,
    );
  }
}
