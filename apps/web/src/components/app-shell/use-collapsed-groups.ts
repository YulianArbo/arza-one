'use client';

import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'arza.menu.collapsed';

function readCollapsed(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((key) => typeof key === 'string') : [];
  } catch {
    return [];
  }
}

function writeCollapsed(keys: readonly string[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {
    // Sin almacenamiento (ventana privada o bloqueo): el menú sigue funcionando sin recordar.
  }
}

/**
 * Grupos del menú que la persona contrajo. Se recuerdan en este navegador, solo como comodidad:
 * por defecto todos están abiertos y nada depende de este dato.
 */
export function useCollapsedGroups(): {
  isCollapsed: (key: string) => boolean;
  toggle: (key: string) => void;
} {
  const [collapsed, setCollapsed] = useState<readonly string[]>([]);
  useEffect(() => {
    setCollapsed(readCollapsed());
  }, []);
  const toggle = useCallback((key: string) => {
    setCollapsed((current) => {
      const next = current.includes(key)
        ? current.filter((entry) => entry !== key)
        : [...current, key];
      writeCollapsed(next);
      return next;
    });
  }, []);
  const isCollapsed = useCallback((key: string) => collapsed.includes(key), [collapsed]);
  return { isCollapsed, toggle };
}
