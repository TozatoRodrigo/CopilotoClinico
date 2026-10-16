import { ConflictException, HttpException } from '@nestjs/common';
import {
  LEGAL_DOCUMENT_OUTDATED,
  TERMS_ACCEPTANCE_REQUIRED,
  TERMS_ACCEPTANCE_REQUIRED_STATUS,
  type LegalDocumentOutdatedError,
  type TermsAcceptanceRequiredError,
} from '../../shared/contracts/legal';

export const TERMS_ACCEPTANCE_REQUIRED_MESSAGE =
  'Os Termos de Uso e a Política de Privacidade foram atualizados. Leia e aceite a nova versão para continuar.';

export const LEGAL_DOCUMENT_OUTDATED_MESSAGE =
  'Esta versão não é mais a vigente. Leia a versão atual antes de aceitar.';

/**
 * CC-905 — 428 com `code` próprio: rota protegida chamada por quem não aceitou
 * a versão vigente. O Nest não tem exceção pronta para 428.
 */
export class TermsAcceptanceRequiredException extends HttpException {
  constructor() {
    const body: TermsAcceptanceRequiredError = {
      statusCode: TERMS_ACCEPTANCE_REQUIRED_STATUS,
      error: 'Precondition Required',
      code: TERMS_ACCEPTANCE_REQUIRED,
      message: TERMS_ACCEPTANCE_REQUIRED_MESSAGE,
    };
    super(body, TERMS_ACCEPTANCE_REQUIRED_STATUS);
  }
}

/** CC-905 — aceite de uma versão que deixou de ser a vigente (outra foi publicada). */
export class LegalDocumentOutdatedException extends ConflictException {
  constructor() {
    const body: LegalDocumentOutdatedError = {
      statusCode: 409,
      error: 'Conflict',
      code: LEGAL_DOCUMENT_OUTDATED,
      message: LEGAL_DOCUMENT_OUTDATED_MESSAGE,
    };
    super(body);
  }
}
