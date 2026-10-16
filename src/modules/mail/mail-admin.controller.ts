import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PrismaService } from '../../config/prisma.service';
import { Roles } from '../../shared/decorators/roles.decorator';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { maskMailAddress } from './mail-address';
import { MailService, type MailSendResult } from './mail.service';

export type MailTestResponse = MailSendResult & {
  /** Destinatário mascarado, o mesmo que aparece no log. */
  to: string;
};

@Controller('admin/mail')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class MailAdminController {
  constructor(
    @Inject(MailService) private readonly mail: MailService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * CC-015 — envia o e-mail de teste para o PRÓPRIO admin, no endereço da
   * conta. O destino nunca vem do corpo: o endpoint não pode virar relay de
   * spam com o domínio do Copiloto.
   *
   * Responde 200 também quando o envio falha: o corpo diz o canal e o código
   * do erro (`EAUTH`, `ETIMEDOUT`, `EENVELOPE` + `responseCode`), que é o que
   * o runbook usa para diagnosticar.
   */
  @Post('test')
  @HttpCode(HttpStatus.OK)
  @Throttle({ short: { limit: 3, ttl: 60000 } })
  async sendTest(@Request() req: { user: { physicianId: string } }): Promise<MailTestResponse> {
    const admin = await this.prisma.physician.findUnique({
      where: { id: req.user.physicianId },
      select: { email: true },
    });
    if (!admin) throw new NotFoundException('Conta não encontrada');

    const result = await this.mail.send({
      to: admin.email,
      template: { name: 'test', params: { sentAt: new Date() } },
    });
    return { ...result, to: maskMailAddress(admin.email) };
  }
}
