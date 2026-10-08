import { Catch, Inject, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Request, Response } from 'express';
import { PinoLogger } from 'nestjs-pino';

import { assignCorrelationId } from '../correlation/correlation-id.js';
import { mapException } from './error-mapper.js';

/** Único punto donde un error se convierte en respuesta (numerales 13.2 y 14.2). */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  constructor(@Inject(PinoLogger) private readonly logger: PinoLogger) {
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
    }
    if (response.headersSent) return;
    if (retryAfterSeconds !== undefined)
      response.setHeader('Retry-After', String(retryAfterSeconds));
    response.status(status).json(body);
  }
}

function correlationIdOf(request: Request, response: Response): string {
  return typeof request.id === 'string' ? request.id : assignCorrelationId(request, response);
}
