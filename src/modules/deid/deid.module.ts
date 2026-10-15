import { Global, Module } from '@nestjs/common';
import { DEID_MODEL_CLIENT, HttpDeidModelClient } from './deid-model.client';
import { DeidentificationService } from './deidentification.service';

/**
 * @Global — como a auditoria, a de-identificação é transversal: caso,
 * resposta, anexo, transcrição e consulta passam por ela (CC-203).
 */
@Global()
@Module({
  providers: [
    { provide: DEID_MODEL_CLIENT, useClass: HttpDeidModelClient },
    DeidentificationService,
  ],
  exports: [DeidentificationService],
})
export class DeidModule {}
