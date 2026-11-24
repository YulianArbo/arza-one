import { Catch, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { assignCorrelationId } from '../correlation/correlation-id.js';
import { ERROR_REPORTER, type ErrorReporter } from '../ops/error-reporter.js';
import { mapException } from './error-mapper.js';

/** Único punto donde un error se convierte en respuesta (numerales 13.2 y 14.2). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(
    @Inject(PinoLogger) private readonly logger: PinoLogger,
    @Inject(ERROR_REPORTER) private readonly reporter: ErrorReporter,
  ) {
    logger.setContext(ApiExceptionFilter.name);
  }

  catch(exception: unknown, host: ArgumentsHost): void {
    const request = host.switchToHttp().getRequest<Request>();
    const response = host.switchToHttp().getResponse<Response>();
    const correlationId = correlationIdOf(request, response);
    const { status, body, retryAfterSeconds } = mapException(exception, correlationId);
    if (status >= 500) {
      // La traza queda solo en el registro interno; la persona recibe un mensaje genérico.
      this.logger.error({ err: exception }, 'Error inesperado');
      // Y a GlitchTip (numeral 10.7): solo el error, la ruta sin valores y la correlación.
      this.reporter.report(exception, { correlationId, where: routeOf(request) });
    }
    if (response.headersSent) return;
    if (retryAfterSeconds !== undefined)
      response.setHeader('Retry-After', String(retryAfterSeconds));
    response.status(status).json(body);
  }
}

/** La ruta declarada («/v1/parties/:id»), nunca la dirección con sus valores. */
function routeOf(request: Request): string {
  const route: unknown = request.route;
  const path =
    typeof route === 'object' && route !== null && 'path' in route ? String(route.path) : '?';
  return `${request.method} ${path}`;
}

function correlationIdOf(request: Request, response: Response): string {
  return typeof request.id === 'string' ? request.id : assignCorrelationId(request, response);
}
