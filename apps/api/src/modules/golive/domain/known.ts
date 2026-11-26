// Lo que la empresa ya tiene, como lo necesita la revisión de las plantillas (B45). Se arma en la
// capa de aplicación con lo que entregan Núcleo, Identidad y Terceros por su index.ts.

interface KnownItem {
  readonly id: string;
  readonly isActive: boolean;
}

export interface KnownStructure {
  /** Procesos y áreas por código; null si se eliminó (un código no se recicla). */
  readonly units: ReadonlyMap<string, KnownItem | null>;
  readonly positions: readonly (KnownItem & { readonly name: string })[];
}

/** Algo que ya existe (por su id) o que la misma carga va a crear (por su clave). */
export type Ref =
  | { readonly kind: 'existing'; readonly id: string }
  | { readonly kind: 'new'; readonly key: string };

export type KnownRef =
  { readonly ref: Ref; readonly active: boolean } | { readonly problem: string };

/** La clave con que se compara un nombre de cargo: sin espacios de más y en minúsculas. */
export function nameKey(name: string): string {
  return name.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('es-CO');
}
