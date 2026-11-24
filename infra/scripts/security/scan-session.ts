// Uso: node infra/scripts/security/scan-session.ts <correo> <archivo-de-salida.json>
//
// Activa la cuenta de análisis invitada con `pnpm iam:invitar`, configura su segundo factor e
// inicia sesión, todo por la API como lo haría una persona (B43). Escribe la cookie de sesión y el
// código antifalsificación para ZAP y k6. Solo para la copia desechable de GitHub Actions.
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';

import { invitationToken, sessionCookie, totpCode } from './scan-auth.ts';

const API = process.env['SCAN_API_URL'] ?? 'http://127.0.0.1:4000';
const MAILPIT = process.env['SCAN_MAILPIT_URL'] ?? 'http://127.0.0.1:8025';
// El mismo origen que la web de la copia: la API solo acepta escrituras desde allí.
const ORIGIN = process.env['SCAN_ORIGIN'] ?? 'http://web:3000';
const SESSION_COOKIE = '__Host-arza_session';

interface Session {
  cookie: string;
  csrf: string;
}

async function call(path: string, body: unknown, session?: Session): Promise<Response> {
  const headers: Record<string, string> = { 'content-type': 'application/json', origin: ORIGIN };
  if (session !== undefined) {
    headers['cookie'] = session.cookie;
    headers['x-csrf-token'] = session.csrf;
  }
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error(`${path} respondió ${String(response.status)}`);
  return response;
}

async function invitationMail(email: string): Promise<string> {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const search = await fetch(`${MAILPIT}/api/v1/search?query=to:${encodeURIComponent(email)}`);
    const found = (await search.json()) as { messages?: { ID: string }[] };
    const id = found.messages?.[0]?.ID;
    if (id !== undefined) {
      const message = (await (await fetch(`${MAILPIT}/api/v1/message/${id}`)).json()) as {
        Text: string;
      };
      return message.Text;
    }
    await new Promise((resolve) => setTimeout(resolve, 2000));
  }
  throw new Error('El correo de invitación no llegó en dos minutos.');
}

function sessionFrom(response: Response, csrf: string): Session {
  const cookie = sessionCookie(response.headers.getSetCookie(), SESSION_COOKIE);
  if (cookie === undefined) throw new Error('La API no entregó la cookie de sesión.');
  return { cookie, csrf };
}

async function signIn(email: string): Promise<Session> {
  const token = invitationToken(await invitationMail(email));
  const password = randomBytes(24).toString('base64url');
  await call('/v1/auth/invitation/accept', { token, display_name: 'Cuenta de análisis', password });
  const login = await call('/v1/auth/login', { email, password });
  const started = sessionFrom(login, ((await login.json()) as { csrf_token: string }).csrf_token);
  const setup = (await (await call('/v1/auth/mfa/setup', {}, started)).json()) as {
    secret: string;
  };
  const confirmed = await call(
    '/v1/auth/mfa/setup/confirm',
    { code: totpCode(setup.secret, new Date()) },
    started,
  );
  const body = (await confirmed.json()) as { session: { csrf_token: string; stage: string } };
  if (body.session.stage !== 'complete') throw new Error('La sesión no quedó completa.');
  return sessionFrom(confirmed, body.session.csrf_token);
}

const [email, output] = process.argv.slice(2);
if (email === undefined || output === undefined) {
  process.stderr.write('Uso: node scan-session.ts <correo> <salida.json>\n');
  process.exitCode = 2;
} else {
  const session = await signIn(email);
  writeFileSync(output, JSON.stringify(session), { mode: 0o600 });
  process.stdout.write('Sesión de análisis lista.\n');
}
