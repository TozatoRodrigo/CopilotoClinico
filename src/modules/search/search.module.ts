import { Module } from '@nestjs/common';
import { GuidelinesModule } from '../guidelines/guidelines.module';
import { UnifiedSearchController } from './search.controller';
import { UnifiedSearchService } from './search.service';

/** CC-502 — busca única do ⌘K (`GET /search`): cartões, protocolos e casos do médico. */
@Module({
  imports: [GuidelinesModule],
  controllers: [UnifiedSearchController],
  providers: [UnifiedSearchService],
})
export class UnifiedSearchModule {}
