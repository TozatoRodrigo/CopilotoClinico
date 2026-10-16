import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';

/**
 * Só os nomes dos campos do corpo, nunca os valores. O corpo traz o texto do
 * caso, as respostas do médico e comentários livres; uma lista de campos
 * "sensíveis" sempre esquece o próximo campo clínico que alguém criar.
 */
export function bodyFieldsForLog(body: unknown): string {
  if (body === null || body === undefined) return '-';
  if (Array.isArray(body)) return `array(${body.length})`;
  if (typeof body !== 'object') return typeof body;
  const fields = Object.keys(body);
  return fields.length > 0 ? fields.join(',') : '-';
}

/**
 * Caminho da requisição sem a querystring: método, caminho e tempo bastam para
 * depurar, e uma query pode carregar texto do médico.
 */
export function pathForLog(url: string): string {
  const queryStart = url.indexOf('?');
  return queryStart === -1 ? url : url.slice(0, queryStart);
}

/**
 * Interceptor que loga requests/responses HTTP sem dado do corpo nem da query.
 *
 * Garante que credenciais, tokens, dados pessoais e texto clínico nunca
 * apareçam nos logs de acesso HTTP, independente de quem chama o endpoint.
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
    }>();

    // CC-026 — sem o IP: com o IP real (o do médico), a linha passaria a ter
    // dado pessoal; o socket (o Traefik) não ajuda a depurar nada.
    const { method } = req;
    const path = pathForLog(req.url);
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const ms = Date.now() - start;
          this.logger.debug(`${method} ${path} — ${ms}ms`);
        },
        error: (err: unknown) => {
          const ms = Date.now() - start;
          const message = err instanceof Error ? err.message : String(err);
          this.logger.warn(
            `${method} ${path} — ERROR ${ms}ms: ${message} bodyFields=${bodyFieldsForLog(req.body)}`,
          );
        },
      }),
    );
  }
}
