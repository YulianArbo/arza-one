'use client';

import { useEffect, useState } from 'react';

const TOKEN_PATTERN = /^[\w-]{43}$/;

/** Llave del enlace del correo, que viene después de «#token=». */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token !== null && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Llave leída, guardada fuera de la pantalla: al quitarla de la dirección, Next.js (y el modo
 * estricto de React) vuelven a montar la pantalla, que la busca aquí. Se olvida al usarla.
 */
let lastRead: { readonly path: string; readonly token: string | null } | null = null;

/**
 * Lee la llave del enlace y la quita de la barra de direcciones, para que no quede en el historial
 * ni a la vista.
 */
export function readLinkToken(location: Location, history: History): string | null {
  const fromUrl = tokenFromHash(location.hash);
  if (fromUrl !== null || lastRead?.path !== location.pathname) {
    lastRead = { path: location.pathname, token: fromUrl };
  }
  if (location.hash !== '') history.replaceState(null, '', location.pathname);
  return lastRead.token;
}

/** Después de usar el enlace, la llave ya no sirve: la pantalla no debe volver a ofrecerla. */
export function forgetLinkToken(): void {
  lastRead = null;
}

/** undefined mientras se lee; null si el enlace no trae una llave. */
export function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setToken(readLinkToken(window.location, window.history));
  }, []);
  return token;
}
