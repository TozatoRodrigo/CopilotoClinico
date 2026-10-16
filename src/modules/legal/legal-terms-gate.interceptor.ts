import {
  Inject,
  Injectable,
  Logger,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Observable } from 'rxjs';
import { ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY } from '../../shared/decorators/legal-acceptance.decorator';
import { LegalDocumentsService } from './legal-documents.service';
import { TermsAcceptanceRequiredException } from './legal.errors';

/**
 * CC-905 — com `LEGAL_TERMS_V2` ligada, recusa com 428
 * (`TERMS_ACCEPTANCE_REQUIRED`) qualquer rota autenticada de quem ainda não
 * aceitou a versão vigente dos termos e da política. Ficam abertas as rotas
 * marcadas com `@AllowWithoutLegalAcceptance()` (aceite, logout e LGPD) e as
 * públicas (sem `req.user`: login, cadastro, refresh).
 *
 * Interceptor, e não guard global: guards globais rodam antes do
 * `JwtAuthGuard` de cada controller, e aqui `req.user` já está resolvido
 * (como no RequestContextInterceptor). Desligada, não consulta o banco.
 */
@Injectable()
export class LegalTermsGateInterceptor implements NestInterceptor {
  private readonly logger = new Logger(LegalTermsGateInterceptor.name);

  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(LegalDocumentsService) private readonly legalDocuments: LegalDocumentsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<unknown>> {
    if (context.getType() !== 'http' || !this.legalDocuments.isGateEnabled()) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest<{ user?: { physicianId?: unknown } }>();
    const physicianId = request.user?.physicianId;
    if (typeof physicianId !== 'string') return next.handle();

    const allowed = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_WITHOUT_LEGAL_ACCEPTANCE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (allowed) return next.handle();

    if (await this.legalDocuments.hasPendingAcceptance(physicianId)) {
      // A rota pelo nome do handler, não pela URL: nada de id no log.
      this.logger.log(
        `LEGAL_TERMS_REQUIRED physicianId=${physicianId} route=${context.getClass().name}.${context.getHandler().name}`,
      );
      throw new TermsAcceptanceRequiredException();
    }
    return next.handle();
  }
}
