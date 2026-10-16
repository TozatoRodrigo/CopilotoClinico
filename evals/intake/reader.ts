import type { ConfigService } from '@nestjs/config';
import type { AiGatewayService } from '../../src/modules/ai-gateway/ai-gateway.service';
import { screenClinicalText } from '../../src/modules/copilot/guardrails/clinical-text-screening';
import { decideIntake } from '../../src/modules/copilot/intake/intake-gate';
import { UnderstandingService } from '../../src/modules/copilot/understanding/understanding.service';
import type { IntakeCase } from './case.schema';
import { extractFields, type ExtractedFields } from './grading';
import type { ProviderFailure } from './guard';
import { systemClock, type Clock, type MeteredGateway } from './metered-gateway';
import type { CallRecord, ReadingOutcome } from './records';

const LOG_LABEL = ' (eval:intake)';

/** Uma tentativa de leitura de um caso por um modelo. */
export interface ReadAttempt {
  outcome: Exclude<ReadingOutcome, 'timeout'>;
  failure: ProviderFailure | null;
  servedModel: string | null;
  readingMs: number;
  firstQuestionMs: number | null;
  questions: string[];
  fields: ExtractedFields | null;
  piiDetected: boolean;
  calls: CallRecord[];
}

export type ReadCase = (model: string, intakeCase: IntakeCase) => Promise<ReadAttempt>;

export interface IntakeReaderDeps {
  gateway: MeteredGateway;
  /** Configuração da leitura com `AI_INTAKE_MODEL` = o modelo da variante. */
  configFor: (model: string) => ConfigService;
  clock?: Clock;
}

/** Leitura que não veio: o motivo é o da última chamada. */
function failedOutcome(last: CallRecord | undefined): ReadAttempt['outcome'] {
  if (!last) return 'provider_error';
  switch (last.failure) {
    case null:
      // A chamada respondeu, mas a saída não passou na validação nem no retry.
      return 'invalid_output';
    case 'refusal':
    case 'truncated':
    case 'stopped':
      return last.failure;
    default:
      return 'provider_error';
  }
}

/**
 * CC-104 — a leitura do caso pelo caminho de produção (IntakeService.start),
 * sem banco: a triagem do texto (PII e injeção), a leitura do
 * UnderstandingService com o `AI_INTAKE_MODEL` da variante e o portão que
 * decide se pergunta. Fica de fora o teto de 20 s: aqui se mede o tempo real,
 * e o relatório conta quantas leituras passariam dele.
 *
 * "Primeira pergunta" é o momento em que o portão a decide. Em produção, a
 * tela ainda espera gravar a conversa — dezenas de milissegundos.
 */
export function createIntakeReader(deps: IntakeReaderDeps): ReadCase {
  const clock = deps.clock ?? systemClock;
  const services = new Map<string, UnderstandingService>();
  const understandingFor = (model: string): UnderstandingService => {
    let service = services.get(model);
    if (!service) {
      // O UnderstandingService só usa `complete` do gateway: o taxímetro entra no lugar dele.
      const gateway = deps.gateway as unknown as AiGatewayService;
      service = new UnderstandingService(gateway, deps.configFor(model));
      services.set(model, service);
    }
    return service;
  };

  return (model, intakeCase) => {
    const calls: CallRecord[] = [];
    return deps.gateway.track(calls, async (): Promise<ReadAttempt> => {
      const startedAt = clock.now();
      // Sem patientRef: os casos do gabarito não têm. A máscara de PII é a de produção.
      const screened = screenClinicalText(intakeCase.input.caseText, null);
      const readingStartedAt = clock.now();
      const result = await understandingFor(model).readForIntake({
        caseText: screened.redacted,
        redFlags: intakeCase.input.redFlags ?? {},
        logLabel: LOG_LABEL,
      });
      const readingMs = clock.now() - readingStartedAt;
      const base = {
        servedModel: result.model,
        readingMs,
        piiDetected: screened.piiDetected,
        calls,
      };

      if (!result.reading) {
        const last = calls.at(-1);
        return {
          ...base,
          outcome: failedOutcome(last),
          failure: last?.failure ?? null,
          firstQuestionMs: null,
          questions: [],
          fields: null,
        };
      }

      const decision = decideIntake(result.reading);
      return {
        ...base,
        outcome: decision.path,
        failure: null,
        firstQuestionMs: decision.path === 'ask' ? clock.now() - startedAt : null,
        questions: decision.questions.map((question) => question.question),
        fields: extractFields(result.reading),
      };
    });
  };
}
