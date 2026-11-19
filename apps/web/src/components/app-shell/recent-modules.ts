'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

import { findNavigationItem, type NavigationItem } from './navigation';

// «Continuar trabajando» (B22B): los últimos módulos que abrió la persona, guardados solo en este
// navegador como comodidad. Si no hay almacenamiento, el Inicio muestra sus módulos y ya.

const KEY_PREFIX = 'arza.recent-modules.';
const MAX_RECENT = 4;

function storageKey(userId: string): string {
  return `${KEY_PREFIX}${userId}`;
}

/** Slugs guardados, del más reciente al más antiguo. */
export function readRecentSlugs(userId: string): string[] {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((slug): slug is string => typeof slug === 'string')
      : [];
  } catch {
    return [];
  }
}

/** Pone el módulo de la dirección al principio de la lista. Inicio y lo desconocido no cuentan. */
export function rememberModule(userId: string, pathname: string): void {
  const [, , slug] = pathname.split('/');
  if (!slug || findNavigationItem(slug) === undefined) return;
  const next = [slug, ...readRecentSlugs(userId).filter((entry) => entry !== slug)];
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next.slice(0, MAX_RECENT)));
  } catch {
    // Sin almacenamiento: no se recuerda, y nada más cambia.
  }
}

/** Registra el módulo de cada página que abre la persona. */
export function useRememberModule(userId: string): void {
  const pathname = usePathname();
  useEffect(() => {
    rememberModule(userId, pathname);
  }, [userId, pathname]);
}

/** Módulos recientes que la persona todavía puede ver, ya resueltos para el menú. */
export function useRecentModules(
  userId: string,
  canSee: (item: NavigationItem) => boolean,
): NavigationItem[] {
  const [slugs, setSlugs] = useState<readonly string[]>([]);
  useEffect(() => {
    setSlugs(readRecentSlugs(userId));
  }, [userId]);
  return slugs
    .map((slug) => findNavigationItem(slug))
    .filter((item): item is NavigationItem => item !== undefined && canSee(item));
}
