import * as Sentry from '@sentry/node';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HeuristicScopeGuard } from './heuristic-scope-guard';
import { JevRequestError } from '../../jev/jev-client';
import { JevScopeGuard } from './jev-scope-guard';
import type {
  QuickQuestionScopeGuard,
  QuickQuestionScopeVerdict,
} from './quick-question-scope-guard';
import { readScopeGuardKind } from './scope-guard.settings';

/**
 * CC-503 — a guarda que o `QuickQuestionService` recebe: escolhe, a cada
 * pergunta, a heurística ou o Jev (`QUICK_QUESTION_SCOPE_GUARD`). Com `jev`
 * sem chave, ou com o Jev fora do ar, decide a heurística — a pergunta nunca
 * fica sem guarda nem sem resposta por causa de uma API externa — e o sinal
 * `jev_unconfigured`/`jev_failed` vai para o log e a trilha.
 */
@Injectable()
export class ConfiguredScopeGuard implements QuickQuestionScopeGuard {
  readonly name = 'configured';
  private readonly logger = new Logger(ConfiguredScopeGuard.name);

  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(HeuristicScopeGuard) private readonly heuristic: HeuristicScopeGuard,
    @Inject(JevScopeGuard) private readonly jev: JevScopeGuard,
  ) {}

  async classify(maskedQuestion: string): Promise<QuickQuestionScopeVerdict> {
    if (readScopeGuardKind(this.config) === 'heuristic') {
      return this.heuristic.classify(maskedQuestion);
    }
    if (!this.jev.configured()) {
      this.logger.warn(
        'QUICK_QUESTION_SCOPE_JEV_UNCONFIGURED: sem JEV_API_KEY, decide a heurística',
      );
      return this.fallback(maskedQuestion, 'jev_unconfigured');
    }
    try {
      return await this.jev.classify(maskedQuestion);
    } catch (error) {
      // Sem a mensagem de erro de fora: a resposta da API pode ecoar a pergunta.
      const reason =
        error instanceof JevRequestError
          ? error.message
          : error instanceof Error
            ? error.name
            : 'unknown';
      this.logger.error(`QUICK_QUESTION_SCOPE_JEV_FAILED: ${reason}`);
      Sentry.captureMessage(`QUICK_QUESTION_SCOPE_JEV_FAILED: ${reason}`, 'error');
      return this.fallback(maskedQuestion, 'jev_failed');
    }
  }

  private async fallback(
    maskedQuestion: string,
    signal: 'jev_unconfigured' | 'jev_failed',
  ): Promise<QuickQuestionScopeVerdict> {
    const verdict = await this.heuristic.classify(maskedQuestion);
    return { ...verdict, signals: [...verdict.signals, signal] };
  }
}
