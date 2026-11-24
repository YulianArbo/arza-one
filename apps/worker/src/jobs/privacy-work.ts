import {
  runPrivacyDailyIn,
  runPrivacyWork,
  tenantsWithPrivacyDailyWork,
  type PrivacyWorkDependencies,
} from '@arza/api/privacy';
import { anonymizeExpiredSubmissions } from '@arza/api/web';

export type PrivacyJobDependencies = PrivacyWorkDependencies &
  Parameters<typeof runPrivacyDailyIn>[0];

/**
 * Correos al titular de su solicitud y PDF de la entrega de sus datos (B42). Repetirlo no cambia
 * nada; si el correo o Gotenberg no responden, lo pendiente queda para la siguiente pasada.
 */
export async function processPrivacyWork(
  deps: PrivacyJobDependencies,
): ReturnType<typeof runPrivacyWork> {
  return runPrivacyWork(deps);
}

export interface PrivacyDailyJobResult {
  readonly alerts: number;
  readonly desisted: number;
  readonly cookiesPurged: number;
  readonly formsAnonymized: number;
}

/**
 * El trabajo diario de Privacidad en cada empresa con algo pendiente (B42): avisos de plazo,
 * desistimiento, cookies de más de tres años y formularios del sitio de más de dos años. El sitio
 * vuelve anónimos sus propios formularios: Privacidad no toca sus tablas.
 */
export async function processPrivacyDailyWork(
  deps: PrivacyJobDependencies,
): Promise<PrivacyDailyJobResult> {
  const total = { alerts: 0, desisted: 0, cookiesPurged: 0, formsAnonymized: 0 };
  for (const tenantId of await tenantsWithPrivacyDailyWork(deps.database, deps.clock.now())) {
    const result = await runPrivacyDailyIn(deps, tenantId);
    total.alerts += result.alerts;
    total.desisted += result.desisted;
    total.cookiesPurged += result.cookiesPurged;
    total.formsAnonymized += await anonymizeExpiredSubmissions(deps, tenantId);
  }
  return total;
}
