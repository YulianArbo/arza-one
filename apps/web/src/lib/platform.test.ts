import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { shouldRetry } from './api/api-provider';
import { ApiError } from './api/api-error';
import { apiOrigin, loadWebEnv } from './config/web-env';
import {
  PRIVATE_PAGES,
  STATIC_SECURITY_HEADERS,
  buildContentSecurityPolicy,
  noIndexHeaders,
} from './security/security-headers';
import { parseTheme, themeClassName, themeCookie } from './theme/theme';

describe('configuración de la web', () => {
  it('valida la dirección de la API y aplica los valores por defecto', () => {
    const env = loadWebEnv({ API_URL: 'http://localhost:4000/' });
    expect(env).toEqual({
      API_URL: 'http://localhost:4000/',
      APP_ENV: 'local',
      NODE_ENV: 'production',
    });
    expect(apiOrigin(env)).toBe('http://localhost:4000');
  });

  it('se niega a funcionar sin una dirección válida de la API', () => {
    expect(() => loadWebEnv({})).toThrow('revise API_URL');
    expect(() => loadWebEnv({ API_URL: 'javascript:alert(1)' })).toThrow('API_URL');
  });
});

describe('política de seguridad del contenido (15.6)', () => {
  const production = buildContentSecurityPolicy({
    nonce: 'abc',
    apiOrigin: 'https://api.arza.test',
    isDevelopment: false,
  });

  it('solo permite recursos propios y datos hacia la API', () => {
    expect(production).toContain("default-src 'self'");
    expect(production).toContain("font-src 'self'");
    expect(production).toContain("connect-src 'self' https://api.arza.test");
    expect(production).toContain("frame-ancestors 'none'");
    expect(production).toContain("object-src 'none'");
    expect(production).toContain("frame-src 'self' blob:");
  });

  it('sin scripts en línea: solo los firmados con el nonce de la petición', () => {
    expect(production).toContain("script-src 'self' 'nonce-abc' 'strict-dynamic'");
    expect(production).not.toMatch(/script-src[^;]*unsafe-inline/);
    expect(production).not.toContain('unsafe-eval');
  });

  it('solo en desarrollo permite evaluar código para mostrar errores', () => {
    const development = buildContentSecurityPolicy({
      nonce: 'abc',
      apiOrigin: 'http://localhost:4000',
      isDevelopment: true,
    });
    expect(development).toContain("'unsafe-eval'");
  });

  it('la aplicación interna y el portal no se indexan ni se guardan en caché', () => {
    expect(noIndexHeaders()).toEqual([
      { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
      { key: 'Cache-Control', value: 'no-store' },
    ]);
  });
});

describe('páginas privadas y aislamiento de ventanas (B43)', () => {
  // Las pruebas de la web corren desde apps/web.
  const appDir = join(process.cwd(), 'src', 'app');
  const pagesOf = (group: string): string[] =>
    readdirSync(join(appDir, group), { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => `/${entry.name}`);

  it('toda pantalla de acceso o de enlace personal está en la lista privada', () => {
    const personal = [...pagesOf('(access)'), ...pagesOf('(client)'), '/baja'];
    for (const path of personal) expect(PRIVATE_PAGES, path).toContain(path);
  });

  it('el sitio público no queda en la lista privada: sigue indexable', () => {
    for (const path of ['/pqrsf', '/verificar', '/derechos-del-titular']) {
      expect(PRIVATE_PAGES).not.toContain(path);
    }
  });

  it('ninguna página ajena comparte la ventana ni incrusta recursos propios', () => {
    expect(STATIC_SECURITY_HEADERS).toContainEqual({
      key: 'Cross-Origin-Opener-Policy',
      value: 'same-origin',
    });
    expect(STATIC_SECURITY_HEADERS).toContainEqual({
      key: 'Cross-Origin-Resource-Policy',
      value: 'same-origin',
    });
  });
});

describe('preferencia de modo claro u oscuro', () => {
  it('solo acepta valores conocidos; lo demás sigue al sistema', () => {
    expect(parseTheme('dark')).toBe('dark');
    expect(parseTheme('<script>')).toBe('system');
    expect(parseTheme(undefined)).toBe('system');
  });

  it('el modo del sistema no fija clase en la página', () => {
    expect(themeClassName('light')).toBe('light');
    expect(themeClassName('system')).toBeUndefined();
  });

  it('la cookie es propia, de un año y segura cuando hay HTTPS', () => {
    expect(themeCookie('dark', true)).toBe(
      'arza_theme=dark; Path=/; Max-Age=31536000; SameSite=Lax; Secure',
    );
    expect(themeCookie('light', false)).not.toContain('Secure');
  });
});

describe('reintentos', () => {
  it('reintenta una vez solo las fallas pasajeras', () => {
    const network = new ApiError('NETWORK_ERROR', 'x', 0);
    expect(shouldRetry(0, network)).toBe(true);
    expect(shouldRetry(1, network)).toBe(false);
    expect(shouldRetry(0, new ApiError('FORBIDDEN', 'x', 403))).toBe(false);
    expect(shouldRetry(0, new Error('otro'))).toBe(false);
  });
});
