import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../config/prisma.service';
import { isMentoringEnabled } from './mentoring.settings';

/**
 * CC-707 — com `COPILOT_MENTORING` desligada, as rotas da mentoria não
 * existem (404), como se o código não estivesse lá. Só GET /mentoring/config
 * fica de fora, para a tela saber que deve esconder o botão.
 */
@Injectable()
export class MentoringEnabledGuard implements CanActivate {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  canActivate(): boolean {
    if (!isMentoringEnabled(this.config)) throw new NotFoundException();
    return true;
  }
}

/**
 * CC-707 — só médicos da equipe com `is_mentor` veem a fila e respondem.
 * Mesma solução provisória do `CuratorGuard`: flag no médico até existir RBAC
 * completo. Usar depois do `JwtAuthGuard` (depende de `request.user`).
 */
@Injectable()
export class MentorGuard implements CanActivate {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<{ user?: { physicianId: string } }>();
    const physicianId = request.user?.physicianId;
    if (!physicianId) throw new UnauthorizedException();

    const physician = await this.prisma.physician.findUnique({
      where: { id: physicianId },
      select: { isMentor: true },
    });
    if (!physician?.isMentor) {
      throw new ForbiddenException('Apenas médicos da equipe de mentoria podem acessar esta área');
    }
    return true;
  }
}
