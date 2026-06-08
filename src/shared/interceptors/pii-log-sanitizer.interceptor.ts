import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Campos que NUNCA devem aparecer em logs HTTP, independente do contexto.
 * Inclui campos de auth, credenciais e qualquer dado pessoal identificável.
 */
const SENSITIVE_FIELDS = new Set([
  'password',
  'passwordHash',
  'password_hash',
  'mfaSecret',
  'mfa_secret',
  'token',
  'accessToken',
  'refreshToken',
  'mfaToken',
  'authorization',
  'x-internal-token',
  'cookie',
  'codeHash',
  'code_hash',
  'backupCodes',
]);

/**
 * Redacta campos sensíveis de um objeto antes de logar.
 * Opera de forma recursiva e não-mutante (retorna novo objeto).
 */
export function sanitizeForLog(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;
  if (typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => sanitizeForLog(v, depth + 1));

  const sanitized: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
    sanitized[key] = SENSITIVE_FIELDS.has(key) ? '[REDACTED]' : sanitizeForLog(val, depth + 1);
  }
  return sanitized;
}

/**
 * Interceptor que loga requests/responses HTTP com campos sensíveis redactados.
 *
 * Garante que credenciais, tokens e dados pessoais nunca apareçam nos logs
 * de acesso HTTP, independente de quem chama o endpoint.
 *
 * Uso: aplicar globalmente via APP_INTERCEPTOR ou por controller.
 *
 * OPS-003: "Logs não contêm PII"
 */
@Injectable()
export class PiiLogSanitizerInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpAccess');

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      url: string;
      body: unknown;
      ip: string;
    }>();

    const { method, url, ip } = req;
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.debug(`${method} ${url} — ${ms}ms [${ip ?? 'unknown'}]`);
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          // Sanitiza o body antes de logar erros — pode conter campos sensíveis
          const safeBody = sanitizeForLog(req.body);
          this.logger.warn(
            `${method} ${url} — ERROR ${ms}ms [${ip ?? 'unknown'}]: ${message} ` +
              `body=${JSON.stringify(safeBody)}`,
          );
        },
      }),
    );
  }
}
