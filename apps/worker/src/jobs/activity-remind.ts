import { sendActivityReminders, type ReminderDependencies } from '@arza/api/crm';

export type ActivityRemindJobDependencies = ReminderDependencies;

/**
 * Recordatorios de las actividades comerciales (B22, ficha 17.6), en el módulo del CRM: avisa al
 * responsable de cada actividad pendiente que empieza en los próximos 30 minutos. Es idempotente:
 * una actividad ya avisada no se vuelve a avisar. Devuelve cuántos recordatorios envió.
 */
export async function processActivityRemind(deps: ActivityRemindJobDependencies): Promise<number> {
  return sendActivityReminders(deps);
}
