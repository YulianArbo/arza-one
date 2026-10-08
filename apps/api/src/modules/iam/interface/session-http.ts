import type { SessionResponse } from '@arza/contracts';
import type { CookieOptions, Response } from 'express';

import { SESSION_COOKIE } from '../application/session-cookie.js';
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
    csrf_token: view.csrfToken,
    expires_at: view.expiresAt.toISOString(),
  };
}
