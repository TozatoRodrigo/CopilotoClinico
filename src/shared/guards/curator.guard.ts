import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../../config/prisma.service';

/**
 * Guard de curadoria (KB-002).
 *
 * Solução provisória até existir RBAC completo: restringe endpoints de
 * curadoria clínica (revisão de diretrizes; F0-D: triagem do feedback dos
 * médicos) a quem tem a flag `is_curator` ativa. Deve ser usado em conjunto
 * com `JwtAuthGuard` (depende de `request.user.physicianId`).
 */
@Injectable()
export class CuratorGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { physicianId: string } }>();
    const physicianId = request.user?.physicianId;
    if (!physicianId) {
      throw new UnauthorizedException();
    }

    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { isCurator: true },
    });

    if (!physician?.isCurator) {
      throw new ForbiddenException('Apenas curadores clínicos podem acessar esta área');
    }

    return true;
  }
}
