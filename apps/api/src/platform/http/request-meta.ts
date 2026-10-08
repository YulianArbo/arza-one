import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

/** Datos de la petición que quedan en la auditoría y en los intentos de inicio de sesión. */
export interface RequestMeta {
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly correlationId: string | null;
}

const MAX_USER_AGENT_LENGTH = 512;

export function requestMetaOf(request: Request): RequestMeta {
  const userAgent = request.headers['user-agent'];
  return {
    ip: request.ip ?? null,
    userAgent: userAgent === undefined ? null : userAgent.slice(0, MAX_USER_AGENT_LENGTH),
    correlationId: typeof request.id === 'string' ? request.id : null,
  };
}

/** Parámetro de controlador con la dirección IP, el navegador y el identificador de correlación. */
export const Meta = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  requestMetaOf(context.switchToHttp().getRequest<Request>()),
);
