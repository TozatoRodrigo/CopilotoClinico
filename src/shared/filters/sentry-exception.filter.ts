import { ArgumentsHost, Catch, ExceptionFilter, HttpException, Logger } from '@nestjs/common';
import * as Sentry from '@sentry/node';

@Catch()
export class SentryExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(SentryExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const isHttpException = exception instanceof HttpException;
    const status = isHttpException ? exception.getStatus() : 500;

    if (status >= 500 && process.env.SENTRY_DSN) {
      Sentry.captureException(exception);
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<{
      status: (code: number) => { send: (body: unknown) => void };
    }>();
    const message = isHttpException
      ? exception.getResponse()
      : { message: 'Internal server error', statusCode: 500 };

    response.status(status).send(message);
  }
}
