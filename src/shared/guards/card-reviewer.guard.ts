import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

export const CARD_REVIEWER_REQUIRED_MESSAGE = 'Apenas revisores de cartões podem acessar esta fila';
export const CARD_REVIEWER_CRM_REQUIRED_MESSAGE = 'A revisão de cartões exige CRM verificado';

/**
 * CC-404 (ADR-019, adendo) — fila de revisão de cartões.
 *
 * O revisor é um médico do piloto, em geral sem papel COMPLIANCE/ADMIN: a
 * flag `is_card_reviewer` dá acesso só a esta fila, nunca ao console admin.
 * CRM verificado é exigido já na entrada — o revisor existe para assinar, e
 * quem não pode assinar não deve decidir o destino do cartão. Deve ser usado
 * em conjunto com `JwtAuthGuard` (depende de `request.user.physicianId`).
 */
@Injectable()
export class CardReviewerGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { physicianId: string } }>();
    const physicianId = request.user?.physicianId;
    if (!physicianId) {
      throw new UnauthorizedException();
    }

    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { isCardReviewer: true, crmVerified: true },
    });

    if (!physician?.isCardReviewer) {
      throw new ForbiddenException(CARD_REVIEWER_REQUIRED_MESSAGE);
    }
    if (!physician.crmVerified) {
      throw new ForbiddenException(CARD_REVIEWER_CRM_REQUIRED_MESSAGE);
    }

    return true;
  }
}
