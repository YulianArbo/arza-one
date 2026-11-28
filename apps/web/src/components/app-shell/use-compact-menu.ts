'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';

const STORAGE_KEY = 'arza.menu.compact';

function readCompact(): boolean {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === 'true';
  } catch {
    return false;
  }
}

function writeCompact(compact: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, String(compact));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueo): el menú se pliega igual, sin recordarlo.
  }
}

/**
 * Menú lateral plegado a iconos en escritorio (B49). Se recuerda en este navegador, solo como
 * comodidad: por defecto el menú está desplegado.
 */
export function useCompactMenu(): { compact: boolean; toggle: () => void } {
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    setCompact(readCompact());
  }, []);
  const toggle = useCallback(() => {
    setCompact((current) => {
      writeCompact(!current);
      return !current;
    });
  }, []);
  return { compact, toggle };
}

/** Si el menú está plegado; los nombres aparecen entonces como ayuda al enfocar el icono. */
export const CompactMenuContext = createContext(false);

export function useIsCompactMenu(): boolean {
  return useContext(CompactMenuContext);
}
