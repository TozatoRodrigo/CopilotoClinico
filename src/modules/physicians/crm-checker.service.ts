import { Injectable, Logger, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export interface CrmCheckResult {
  valid: boolean;
  source: 'cfm_api' | 'cfm_portal' | 'unavailable';
  raw?: string;
}

const MAX_RETRIES = 3;
const FETCH_TIMEOUT_MS = 5000;

@Injectable()
export class CrmCheckerService {
  private readonly logger = new Logger(CrmCheckerService.name);
  private readonly verificationUrl: string | undefined;

  constructor(@Inject(ConfigService) private readonly config: ConfigService) {
    this.verificationUrl = this.config.get<string>('CRM_VERIFICATION_URL');
  }

  async check(crmUf: string, crmNumber: string): Promise<CrmCheckResult> {
    if (!this.verificationUrl) {
      this.logger.warn('CRM_VERIFICATION_URL not configured — auto-verification unavailable');
      return { valid: false, source: 'unavailable' };
    }

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = `${this.verificationUrl}?uf=${encodeURIComponent(crmUf)}&crm=${encodeURIComponent(crmNumber)}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        const response = await fetch(url, {
          signal: controller.signal,
          headers: { 'User-Agent': 'CopilotoClinico/1.0 (verificacao@copiloto.med)' },
        });
        clearTimeout(timeout);

        const text = await response.text();
        const valid = response.ok && this.parseValid(text);
        this.logger.log(
          `CRM check ${crmUf}-${crmNumber}: ${valid ? 'VALID' : 'INVALID'} (attempt ${attempt})`,
        );
        return { valid, source: 'cfm_api', raw: text.substring(0, 200) };
      } catch (err) {
        lastError = err;
        this.logger.warn(
          `CRM check attempt ${attempt}/${MAX_RETRIES} failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        if (attempt < MAX_RETRIES) {
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 500));
        }
      }
    }

    this.logger.error(`CRM check exhausted retries for ${crmUf}-${crmNumber}`, lastError);
    return { valid: false, source: 'unavailable' };
  }

  private parseValid(body: string): boolean {
    try {
      const json = JSON.parse(body) as { ativo?: boolean; active?: boolean; valid?: boolean };
      return !!(json.ativo ?? json.active ?? json.valid);
    } catch {
      return body.toLowerCase().includes('ativo') || body.toLowerCase().includes('active');
    }
  }
}
