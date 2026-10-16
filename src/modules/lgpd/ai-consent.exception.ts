import { ForbiddenException } from '@nestjs/common';
import { AI_CONSENT_REVOKED, type AiConsentRevokedError } from '../../shared/contracts/clinical';

export const AI_CONSENT_REVOKED_MESSAGE =
  'Você revogou o consentimento para processamento por IA. Para analisar casos, ' +
  'responder às perguntas e ditar, conceda de novo em Configurações → Privacidade.';

/** CC-010 — 403 com `code` próprio no contrato, antes de qualquer chamada de IA. */
export class AiConsentRevokedException extends ForbiddenException {
  constructor() {
    const body: AiConsentRevokedError = {
      statusCode: 403,
      error: 'Forbidden',
      code: AI_CONSENT_REVOKED,
      message: AI_CONSENT_REVOKED_MESSAGE,
    };
    super(body);
  }
}
