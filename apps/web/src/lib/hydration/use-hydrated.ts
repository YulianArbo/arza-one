'use client';

import { useSyncExternalStore } from 'react';

const subscribe = (): (() => void) => () => undefined;

/**
 * true cuando la página ya cargó su lógica en el navegador. Los botones de enviar esperan a ese
 * momento: un clic anterior recargaría la página y la persona perdería lo que escribió.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
