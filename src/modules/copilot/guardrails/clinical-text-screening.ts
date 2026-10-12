import { BadRequestException, type Logger } from '@nestjs/common';
import type { AuditService } from '../../audit/audit.service';
import { maskPII } from './pii-filter';
import { scanForInjection, type InjectionScanResult } from './injection-defense';

/**
 * LGPD-005: Redação explícita do patientRef no texto clínico.
 *
 * Mesmo após LGPD-001 (patientRef como identificador opaco), o médico pode
 * digitar o valor do patientRef no texto livre do caso clínico. Esta função
 * garante que o valor nunca chegue ao provider de IA, independente da camada
 * de pseudonimização da integração hospitalar.
 *
 * Defense-in-depth: opera APÓS maskPII() para cobrir casos que o filtro
 * geral de PII não captura (ex: identificadores de prontuário específicos).
 */
// S25-QC-01 — patientRef agora é opcional (consulta rápida); o `!patientRef`
// já cobria string vazia e continua cobrindo `null`/`undefined` sem mudança
// de comportamento.
export function redactPatientRef(text: string, patientRef: string | null): string {
  if (!patientRef) return text;
  return text.split(patientRef).join('[PATIENT_REF_REDACTED]');
}

export interface ScreenedClinicalText {
  /** Texto com PII mascarada e patientRef redigido — o único que segue adiante. */
  redacted: string;
  piiDetected: boolean;
  patientRefRedacted: boolean;
  injection: InjectionScanResult;
}

/** Camadas 1 e 2 (PII e patientRef) e a varredura de injeção, nesta ordem. */
export function screenClinicalText(text: string, patientRef: string | null): ScreenedClinicalText {
  const pii = maskPII(text);
  const redacted = redactPatientRef(pii.redacted, patientRef);
  return {
    redacted,
    piiDetected: pii.hasPII,
    patientRefRedacted: pii.redacted !== redacted,
    injection: scanForInjection(redacted),
  };
}

/**
 * Barreira de injeção: audita a tentativa sem gravar o texto clínico (só
 * tamanho e sinais) e recusa o pedido antes de qualquer chamada ao modelo.
 */
export async function rejectInjection(
  deps: { audit: AuditService; logger: Logger },
  request: { physicianId: string; encounterId: string; logLabel: string },
  scan: InjectionScanResult,
  evidence: { piiDetected: boolean; patientRefRedacted: boolean; inputLength: number },
): Promise<void> {
  if (scan.safe) return;

  deps.logger.warn(`Injection detected${request.logLabel}: ${scan.reasons.join(', ')}`);
  await deps.audit.log({
    actorId: request.physicianId,
    action: 'PROMPT_INJECTION_DETECTED',
    entity: 'Encounter',
    entityId: request.encounterId,
    payload: {
      reasons: scan.reasons,
      confidence: scan.confidence,
      ...evidence,
    },
  });
  throw new BadRequestException({
    message: 'Input contains potentially unsafe content',
    reasons: scan.reasons,
  });
}
