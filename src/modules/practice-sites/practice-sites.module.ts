import { Module } from '@nestjs/common';
import { PracticeSitesController } from './practice-sites.controller';
import { PracticeSitesService } from './practice-sites.service';

/** CC-602 — locais de plantão do médico. AuditService e PrismaService são globais. */
@Module({
  controllers: [PracticeSitesController],
  providers: [PracticeSitesService],
})
export class PracticeSitesModule {}
