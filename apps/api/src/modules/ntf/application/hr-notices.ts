import { ONBOARDING_TASKS, onboardingTaskKindSchema } from '@arza/contracts';
import { z } from 'zod';

import type { Handler, Notice } from './notice-types.js';

// Avisos de Talento humano (B35, decisión 6). Al vincular a un colaborador, cada responsable de una
// tarea de inducción se entera de ella: SST de la evaluación médica de ingreso y de la inducción en
// SST, Administrativo y financiero de la asignación de equipo, el jefe inmediato del entrenamiento
// en el cargo. Quien vincula no recibe aviso de las tareas que quedaron a su cargo: ya las conoce.
// El evento no lleva datos personales: el aviso habla de «un colaborador nuevo».

const hiredSchema = z.object({
  employee_id: z.uuid(),
  onboarding: z
    .array(
      z.object({
        task_id: z.uuid(),
        kind: onboardingTaskKindSchema,
        responsible_id: z.uuid().nullable(),
        due_on: z.iso.date(),
      }),
    )
    .default([]),
});

/** AAAA-MM-DD como se muestra en Colombia: dd/mm/aaaa. */
function shownDate(date: string): string {
  const [year, month, day] = date.split('-');
  return `${day ?? ''}/${month ?? ''}/${year ?? ''}`;
}

/** La asignación de equipo se hace en Activos; las demás tareas, fuera de la plataforma. */
function linkFor(kind: string): string | null {
  return kind === 'equipment' ? '/app/compras/activos' : null;
}

const onEmployeeHired: Handler = (_tx, event) => {
  const payload = hiredSchema.parse(event.payload);
  const notices: Notice[] = [];
  for (const task of payload.onboarding) {
    if (task.responsible_id === null || task.responsible_id === event.actorId) continue;
    notices.push({
      userId: task.responsible_id,
      kind: 'hr_onboarding_task',
      values: { tarea: ONBOARDING_TASKS[task.kind].label, vence: shownDate(task.due_on) },
      link: linkFor(task.kind),
    });
  }
  return Promise.resolve(notices);
};

export const HR_HANDLERS: Readonly<Record<string, Handler>> = {
  'employee.hired': onEmployeeHired,
};
