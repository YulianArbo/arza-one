'use client';

import { useEffect, useState } from 'react';

const TOKEN_PATTERN = /^[\w-]{43}$/;

/** Llave del enlace del correo, que viene después de «#token=». */
export function tokenFromHash(hash: string): string | null {
  const token = new URLSearchParams(hash.replace(/^#/, '')).get('token');
  return token !== null && TOKEN_PATTERN.test(token) ? token : null;
}

/**
 * Lee la llave del enlace una sola vez y la quita de la barra de direcciones, para que no quede en
 * el historial ni a la vista. undefined mientras se lee; null si el enlace no trae una llave.
 */
export function useLinkToken(): string | null | undefined {
  const [token, setToken] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setToken(tokenFromHash(window.location.hash));
    window.history.replaceState(null, '', window.location.pathname);
  }, []);
  return token;
}
