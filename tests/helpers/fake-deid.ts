import type { ConfigService } from '@nestjs/config';
import type { ModelEntity } from '../../src/modules/copilot/guardrails/model-entities';
import type { DeidModelClient } from '../../src/modules/deid/deid-model.client';
import { DeidentificationService } from '../../src/modules/deid/deidentification.service';

/** ConfigService só com os valores dados: o `process.env` de quem roda o teste não entra. */
export function configWith(values: Record<string, string>): ConfigService {
  return { get: (key: string) => values[key] } as unknown as ConfigService;
}

/**
 * Fake do serviço copiloto-deid (CC-203): marca como nome cada ocorrência dos
 * nomes dados — o que a regex sozinha não acha ("Maria da Silva" sem "Dona").
 * Guarda os textos recebidos, para o teste conferir que a regex rodou antes.
 */
export function fakeNameModel(names: readonly string[]): DeidModelClient & { received: string[] } {
  const received: string[] = [];
  return {
    received,
    findEntities: (text: string) => {
      received.push(text);
      const entities: ModelEntity[] = names.flatMap((name) =>
        [...text.matchAll(new RegExp(name, 'g'))].map((match) => ({
          label: 'FIRSTNAME' as const,
          start: match.index,
          end: match.index + name.length,
          score: 0.99,
        })),
      );
      return Promise.resolve(entities);
    },
  };
}

/** DeidentificationService com DEID_MODE=model e o fake no lugar do serviço. */
export function modelDeidentifier(
  names: readonly string[],
): DeidentificationService & { model: ReturnType<typeof fakeNameModel> } {
  const model = fakeNameModel(names);
  const service = new DeidentificationService(configWith({ DEID_MODE: 'model' }), model);
  return Object.assign(service, { model });
}
