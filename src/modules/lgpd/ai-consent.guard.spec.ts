import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it, vi } from 'vitest';
import { AiConsentGuard } from './ai-consent.guard';
import { AiConsentRevokedException } from './ai-consent.exception';
import type { LgpdService } from './lgpd.service';
import { CopilotController } from '../copilot/copilot.controller';
import { IntakeController } from '../copilot/intake/intake.controller';
import { AudioController } from '../audio/audio.controller';

function contextFor(user: { physicianId?: string } | undefined): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

function guardWith(assertAiProcessingAllowed: ReturnType<typeof vi.fn>) {
  return new AiConsentGuard({ assertAiProcessingAllowed } as unknown as LgpdService);
}

describe('AiConsentGuard', () => {
  it('lets the request through while the physician keeps ai_processing', async () => {
    const assert = vi.fn().mockResolvedValue(undefined);

    await expect(guardWith(assert).canActivate(contextFor({ physicianId: 'phy-1' }))).resolves.toBe(
      true,
    );
    expect(assert).toHaveBeenCalledWith('phy-1');
  });

  it('propagates the AI_CONSENT_REVOKED refusal', async () => {
    const assert = vi.fn().mockRejectedValue(new AiConsentRevokedException());

    await expect(
      guardWith(assert).canActivate(contextFor({ physicianId: 'phy-1' })),
    ).rejects.toBeInstanceOf(AiConsentRevokedException);
  });

  it('refuses without an authenticated physician (guard out of order)', async () => {
    const assert = vi.fn();

    await expect(guardWith(assert).canActivate(contextFor(undefined))).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(assert).not.toHaveBeenCalled();
  });
});

/**
 * Regressão: toda rota que manda o caso a um modelo passa pela checagem, e as
 * que só leem o histórico continuam abertas a quem revogou. Rota nova que
 * chama IA entra na primeira lista.
 */
describe('rotas com IA exigem o consentimento ai_processing', () => {
  type Route = readonly [controller: { name: string; prototype: object }, handler: string];

  const guardsOf = ([controller, handler]: Route): unknown[] =>
    (Reflect.getMetadata(
      GUARDS_METADATA,
      (controller.prototype as Record<string, object>)[handler]!,
    ) as unknown[] | undefined) ?? [];
  const named = (routes: Route[]) =>
    routes.map((route) => [`${route[0].name}.${route[1]}`, route] as const);

  it.each(
    named([
      [CopilotController, 'analyze'],
      [CopilotController, 'stream'],
      [CopilotController, 'respond'],
      [CopilotController, 'respondStream'],
      [CopilotController, 'analyzeAsync'],
      [IntakeController, 'start'],
      [IntakeController, 'analyze'],
      [IntakeController, 'stream'],
      [AudioController, 'upload'],
      [AudioController, 'transcribe'],
    ]),
  )('%s', (_name, route) => {
    expect(guardsOf(route)).toContain(AiConsentGuard);
  });

  it.each(
    named([
      [CopilotController, 'getLatest'],
      [CopilotController, 'getJobStatus'],
      [CopilotController, 'feedback'],
      [IntakeController, 'getConversation'],
      [IntakeController, 'answer'],
      [IntakeController, 'skip'],
    ]),
  )('%s fica aberta', (_name, route) => {
    expect(guardsOf(route)).not.toContain(AiConsentGuard);
  });
});
