import type { ConfigService } from '@nestjs/config';
import { readBooleanFlag } from '../../config/feature-flag';

export const BETA_INVITE_REQUIRED_FLAG = 'BETA_INVITE_REQUIRED';

/**
 * CC-702 — `on` fecha o cadastro para quem não tem convite (beta fechado).
 * Padrão `off`: o cadastro segue aberto como antes. Lida a cada chamada, para
 * abrir ou fechar o beta sem redeploy.
 */
export function isBetaInviteRequired(config: ConfigService): boolean {
  return readBooleanFlag(config, BETA_INVITE_REQUIRED_FLAG, false);
}
