import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { ConversationService } from '../../src/modules/copilot/intake/conversation.service';
import { IntakeService } from '../../src/modules/copilot/intake/intake.service';
import { EvalModule } from './eval.module';
import { CompletionRecorder } from './recorder';

/**
 * CC-106 — o afunilamento entra pela conversa do Copiloto guiado: o contexto
 * Nest do gabarito precisa montá-la com os mesmos serviços de produção. Só
 * monta o grafo de dependências: nada conecta ao banco nem chama provedor.
 */
describe('EvalModule', () => {
  it('monta a conversa do Copiloto guiado ao lado do orquestrador', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [
        EvalModule.forVariant(
          {
            AI_PROVIDER: 'test',
            AI_MODEL: 'modelo-de-teste',
            AI_EMBEDDING_MODEL: 'embedding-de-teste',
            AI_API_KEY: 'chave-de-teste',
          },
          new CompletionRecorder(),
        ),
      ],
    }).compile();

    try {
      expect(moduleRef.get(IntakeService)).toBeInstanceOf(IntakeService);
      expect(moduleRef.get(ConversationService)).toBeInstanceOf(ConversationService);
    } finally {
      await moduleRef.close();
    }
  });
});
