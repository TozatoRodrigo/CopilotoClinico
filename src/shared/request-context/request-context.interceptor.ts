import {
  Injectable,
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestIdFrom, runWithRequestContext, uuidOrNull } from './request-context';

export const REQUEST_ID_HEADER = 'x-request-id';

interface HttpRequest {
  headers: Record<string, unknown>;
  params?: Record<string, unknown>;
  user?: { physicianId?: unknown };
}

interface HttpReply {
  header(name: string, value: string): unknown;
}

/**
 * Abre o contexto da requisição (requestId, médico, atendimento) e devolve o
 * requestId no cabeçalho da resposta, para o médico ou o suporte citarem.
 * Roda depois dos guards: `req.user` já está resolvido.
 */
@Injectable()
export class RequestContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const http = context.switchToHttp();
    const req = http.getRequest<HttpRequest>();
    const requestContext = {
      requestId: requestIdFrom(req.headers[REQUEST_ID_HEADER]),
      physicianId: uuidOrNull(req.user?.physicianId),
      encounterId: uuidOrNull(req.params?.encounterId),
    };
    http.getResponse<HttpReply>().header(REQUEST_ID_HEADER, requestContext.requestId);

    // A inscrição acontece dentro do contexto: o handler e o que ele dispara
    // depois (streams, gravações) herdam o requestId.
    return new Observable((subscriber) =>
      runWithRequestContext(requestContext, () => next.handle().subscribe(subscriber)),
    );
  }
}
