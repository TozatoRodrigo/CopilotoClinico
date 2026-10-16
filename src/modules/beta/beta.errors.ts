import { ForbiddenException } from '@nestjs/common';
import {
  BETA_INVITE_INVALID,
  BETA_INVITE_PROBLEM_MESSAGES,
  BETA_INVITE_REQUIRED,
  type BetaInviteInvalidError,
  type BetaInviteProblem,
  type BetaInviteRequiredError,
} from '../../shared/contracts/beta';

export const BETA_INVITE_REQUIRED_MESSAGE =
  'O cadastro está aberto só para convidados do beta. Use seu código de convite ou entre na lista de espera.';

/** CC-702 — cadastro sem código com `BETA_INVITE_REQUIRED` ligada. */
export class BetaInviteRequiredException extends ForbiddenException {
  constructor() {
    const body: BetaInviteRequiredError = {
      statusCode: 403,
      error: 'Forbidden',
      code: BETA_INVITE_REQUIRED,
      message: BETA_INVITE_REQUIRED_MESSAGE,
    };
    super(body);
  }
}

/** CC-702 — código digitado que não serve; `reason` diz por quê. */
export class BetaInviteInvalidException extends ForbiddenException {
  readonly reason: BetaInviteProblem;

  constructor(reason: BetaInviteProblem) {
    const body: BetaInviteInvalidError = {
      statusCode: 403,
      error: 'Forbidden',
      code: BETA_INVITE_INVALID,
      reason,
      message: BETA_INVITE_PROBLEM_MESSAGES[reason],
    };
    super(body);
    this.reason = reason;
  }
}
