import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';
import { RolesGuard } from '../../shared/guards/roles.guard';
import { Roles } from '../../shared/decorators/roles.decorator';
import { ZodValidationPipe } from '../../shared/pipes/zod-validation.pipe';
import { MentorGuard, MentoringEnabledGuard } from './mentoring.guards';
import { MentoringService } from './mentoring.service';
import { MentoringAdminService } from './mentoring-admin.service';
import {
  answerMentoringRequestSchema,
  createMentoringRequestSchema,
  mentorQueueQuerySchema,
  mentoringAdminQuerySchema,
  rateMentoringRequestSchema,
} from './mentoring.schemas';
import type {
  AnswerMentoringRequestInput,
  CreateMentoringRequestInput,
  MentorQueueQuery,
  MentoringAdminQuery,
  RateMentoringRequestInput,
} from './mentoring.schemas';

type AuthenticatedRequest = { user: { physicianId: string } };

/**
 * CC-707 — rotas de quem pede mentoria e o estado da flag. Só
 * GET /mentoring/config responde com a flag desligada (para a tela esconder o
 * botão); o resto é 404.
 */
@Controller('mentoring')
@UseGuards(JwtAuthGuard)
export class MentoringController {
  constructor(@Inject(MentoringService) private readonly mentoring: MentoringService) {}

  @Get('config')
  config(@Request() req: AuthenticatedRequest) {
    return this.mentoring.getConfig(req.user.physicianId);
  }

  @Get('notifications')
  @UseGuards(MentoringEnabledGuard)
  notifications(@Request() req: AuthenticatedRequest) {
    return this.mentoring.notifications(req.user.physicianId);
  }

  @Post('requests/:id/cancel')
  @HttpCode(200)
  @UseGuards(MentoringEnabledGuard)
  cancel(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentoring.cancel(req.user.physicianId, id);
  }

  @Post('requests/:id/rating')
  @HttpCode(200)
  @UseGuards(MentoringEnabledGuard)
  rate(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(rateMentoringRequestSchema)) body: RateMentoringRequestInput,
  ) {
    return this.mentoring.rate(req.user.physicianId, id, body);
  }

  @Post('requests/:id/seen')
  @HttpCode(200)
  @UseGuards(MentoringEnabledGuard)
  seen(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentoring.markAnswerSeen(req.user.physicianId, id);
  }
}

/** CC-707 — o pedido nasce no caso; só o médico dono do caso pede e lê a resposta. */
@Controller('encounters/:encounterId/mentoring')
@UseGuards(JwtAuthGuard, MentoringEnabledGuard)
export class EncounterMentoringController {
  constructor(@Inject(MentoringService) private readonly mentoring: MentoringService) {}

  @Get()
  list(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
  ) {
    return this.mentoring.listForEncounter(req.user.physicianId, encounterId);
  }

  @Post()
  create(
    @Request() req: AuthenticatedRequest,
    @Param('encounterId', ParseUUIDPipe) encounterId: string,
    @Body(new ZodValidationPipe(createMentoringRequestSchema)) body: CreateMentoringRequestInput,
  ) {
    return this.mentoring.create(req.user.physicianId, encounterId, body);
  }
}

/** CC-707 — fila e resposta dos médicos da equipe (`is_mentor`). */
@Controller('mentoring/queue')
@UseGuards(JwtAuthGuard, MentoringEnabledGuard, MentorGuard)
export class MentorQueueController {
  constructor(@Inject(MentoringService) private readonly mentoring: MentoringService) {}

  @Get()
  list(
    @Request() req: AuthenticatedRequest,
    @Query(new ZodValidationPipe(mentorQueueQuerySchema)) query: MentorQueueQuery,
  ) {
    return this.mentoring.queue(req.user.physicianId, query);
  }

  @Get(':id')
  detail(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentoring.detailForMentor(req.user.physicianId, id);
  }

  @Post(':id/claim')
  @HttpCode(200)
  claim(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentoring.claim(req.user.physicianId, id);
  }

  @Post(':id/release')
  @HttpCode(200)
  release(@Request() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.mentoring.release(req.user.physicianId, id);
  }

  @Post(':id/answer')
  @HttpCode(200)
  answer(
    @Request() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodValidationPipe(answerMentoringRequestSchema)) body: AnswerMentoringRequestInput,
  ) {
    return this.mentoring.answer(req.user.physicianId, id, body);
  }
}

/**
 * CC-707 — painel no console. Compliance/Admin, como o painel de custo: só
 * metadados (contagens, tempos, notas, nomes de médicos), nenhum texto do caso.
 */
@Controller('admin/mentoring')
@UseGuards(JwtAuthGuard, MentoringEnabledGuard, RolesGuard)
@Roles('COMPLIANCE', 'ADMIN')
export class MentoringAdminController {
  constructor(@Inject(MentoringAdminService) private readonly admin: MentoringAdminService) {}

  @Get()
  overview(@Query(new ZodValidationPipe(mentoringAdminQuerySchema)) query: MentoringAdminQuery) {
    return this.admin.overview(query);
  }
}
