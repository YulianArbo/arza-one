import {
  followCustomerCare,
  type CareWorkDependencies,
  type CareWorkResult,
} from '@arza/api/service';

export type CareWorkJobDependencies = CareWorkDependencies;

/**
 * PQRSF y encuestas (B29): el acuse y la respuesta por correo, la invitación a la encuesta y los
 * avisos de «por vencer» y vencida. Repetirlo no cambia nada; si el correo no responde, lo pendiente
 * queda para la siguiente pasada.
 */
export async function processCareWork(deps: CareWorkJobDependencies): Promise<CareWorkResult> {
  return followCustomerCare(deps);
}
