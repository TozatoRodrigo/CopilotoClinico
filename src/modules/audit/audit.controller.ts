import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { auditQuerySchema } from './schemas/audit.schemas';
import type { AuditQueryInput } from './schemas/audit.schemas';

@Controller('audit')
@UseGuards(JwtAuthGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async query(
    @Request() req: { user: { physicianId: string } },
    @Query(new ZodValidationPipe(auditQuerySchema)) query: AuditQueryInput,
  ) {
    const result = await this.auditService.query({
      ...query,
      actorId: req.user.physicianId,
    });
    return { data: result.items, total: result.total };
  }
}
