// Rutas y textos de los avisos (B16).

export const NTF_PATHS = {
  center: '/app/avisos',
  preferences: '/app/perfil/avisos',
  templates: '/app/administracion/plantillas',
} as const;

/** «3 avisos sin leer», para la campanita y los lectores de pantalla. */
export function unreadLabel(count: number): string {
  if (count === 0) return 'Avisos: no tiene avisos sin leer';
  return count === 1 ? 'Avisos: 1 sin leer' : `Avisos: ${String(count)} sin leer`;
}

/** Cifra corta de la campanita: hasta 9, luego «9+». */
export function badgeCount(count: number): string {
  return count > 9 ? '9+' : String(count);
}
