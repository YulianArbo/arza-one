import { sendSiteMail, type SiteWorkDependencies } from '@arza/api/web';

export type SiteWorkJobDependencies = SiteWorkDependencies;

/**
 * Acuse de los formularios de contacto y cotización del sitio, con su enlace de baja (B41).
 * Repetirlo no cambia nada; si el correo no responde, lo pendiente queda para la siguiente pasada.
 */
export async function processSiteWork(deps: SiteWorkJobDependencies): Promise<number> {
  return sendSiteMail(deps);
}
