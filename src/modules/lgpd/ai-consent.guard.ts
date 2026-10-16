import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { LgpdService } from './lgpd.service';

/**
 * CC-010 — recusa com 403 (`AI_CONSENT_REVOKED`) o pedido de quem revogou o
 * consentimento `ai_processing`, antes do handler: nenhuma conversa é
 * gravada, nenhum áudio vai ao Whisper e nenhuma chamada sai pelo gateway.
 * Depende de `JwtAuthGuard` na classe (`request.user.physicianId`).
 */
@Injectable()
export class AiConsentGuard implements CanActivate {
  constructor(@Inject(LgpdService) private readonly lgpd: LgpdService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { physicianId?: string } }>();
    const physicianId = request.user?.physicianId;
    if (!physicianId) {
      throw new UnauthorizedException();
    }
    await this.lgpd.assertAiProcessingAllowed(physicianId);
    return true;
  }
}

/**
 * Marca a rota que manda o caso do médico a um modelo: leitura do caso,
 * análise (POST, streaming, fila), reanálise e ditado. Rotas que só leem o
 * histórico ficam abertas: revogar não esconde o que já foi feito.
 */
export const RequiresAiConsent = (): MethodDecorator & ClassDecorator => UseGuards(AiConsentGuard);
