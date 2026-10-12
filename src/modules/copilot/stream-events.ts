import type { MessageEvent } from '@nestjs/common';
import { Observable } from 'rxjs';
import type { StreamEvent } from './orchestrator/orchestrator.service';

/**
 * SSE dos streamings do copiloto (análise inicial, conversa do Copiloto
 * guiado e reanálise): cada evento do orquestrador vira um `data: <json>` e o
 * stream fecha no `done` ou no `error`. O gerador só é criado na inscrição —
 * o Observable é frio — e segue até o fim mesmo se o médico fechar a aba: a
 * análise fica gravada e aparece quando o caso for reaberto.
 */
export function streamEvents(open: () => AsyncGenerator<StreamEvent>): Observable<MessageEvent> {
  return new Observable((subscriber) => {
    const gen = open();

    void (async () => {
      try {
        for await (const event of gen) {
          subscriber.next({ data: event });
          if (event.type === 'done' || event.type === 'error') break;
        }
        subscriber.complete();
      } catch (err) {
        subscriber.error(err);
      }
    })();
  });
}
