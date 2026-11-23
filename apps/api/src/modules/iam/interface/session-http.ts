import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { SessionResponse } from '@arza/contracts';
import type { CookieOptions, Request, Response } from 'express';

import { DEVICE_COOKIE, SESSION_COOKIE, deviceTokenFrom } from '../application/session-cookie.js';
import type { SessionView } from '../application/session-service.js';

const COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  path: '/',
};

/** Entrega la llave en la cookie protegida; vence con la sesión (12 horas). */
export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE, token, { ...COOKIE_OPTIONS, expires: expiresAt });
}

/** La marca del equipo dura lo máximo que permiten los navegadores (400 días). */
const DEVICE_COOKIE_MAX_AGE_MS = 400 * 24 * 60 * 60 * 1000;

export function setDeviceCookie(response: Response, token: string): void {
  response.cookie(DEVICE_COOKIE, token, { ...COOKIE_OPTIONS, maxAge: DEVICE_COOKIE_MAX_AGE_MS });
}

/** Parámetro de controlador con la marca del equipo que trae la petición, o null. */
export const DeviceToken = createParamDecorator((_data: unknown, context: ExecutionContext) =>
  deviceTokenFrom(context.switchToHttp().getRequest<Request>().headers.cookie),
);

export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE, COOKIE_OPTIONS);
}

export function toSessionResponse(view: SessionView): SessionResponse {
  return {
    user: {
      id: view.user.id,
      email: view.user.email,
      display_name: view.user.displayName,
      kind: view.user.kind,
    },
    stage: view.stage,
    csrf_token: view.csrfToken,
    expires_at: view.expiresAt.toISOString(),
    terms_pending: view.termsPending,
  };
}
