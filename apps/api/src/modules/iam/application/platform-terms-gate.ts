import type { TenantTransaction } from '../../../platform/database/tenant-context.js';

// Puerto de los términos de la plataforma (B41, decisión 3). El sitio público ya depende de
// identidad para los nombres de las personas; para no cerrar el círculo, identidad pregunta aquí
// si la persona tiene una versión pendiente y el módulo del sitio lo implementa.

export interface PlatformTermsGate {
  /** La persona interna no ha aceptado la versión publicada; falso si no hay ninguna publicada. */
  pendingFor(tx: TenantTransaction, userId: string): Promise<boolean>;
}

export const PLATFORM_TERMS_GATE = Symbol('PLATFORM_TERMS_GATE');

/** Al aceptar, las sesiones abiertas de la persona dejan de esperar los términos. */
export async function clearTermsPending(tx: TenantTransaction, userId: string): Promise<void> {
  await tx.session.updateMany({
    where: { userId, termsPending: true },
    data: { termsPending: false },
  });
}
