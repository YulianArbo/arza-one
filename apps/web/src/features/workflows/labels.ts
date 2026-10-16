import type {
  DefinitionStatus,
  StateKind,
  TaskPriority,
  TaskReason,
  TaskStatus,
} from '@arza/contracts';

// Textos del motor de flujos y las tareas (numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

/** Rutas de las tareas y del editor de flujos (numeral 16.7). */
export const WF_PATHS = {
  inbox: '/app/mis-tareas',
  board: '/app/mis-tareas/tablero',
  task: (id: string) => `/app/mis-tareas/${id}`,
  instance: (id: string) => `/app/mis-tareas/tramites/${id}`,
  definitions: '/app/administracion/flujos',
  newDefinition: '/app/administracion/flujos/nuevo',
  definition: (id: string) => `/app/administracion/flujos/${id}`,
} as const;

export const TASK_STATUS_LABELS: Readonly<Record<TaskStatus, string>> = {
  pending: 'Pendiente',
  in_progress: 'En curso',
  completed: 'Completada',
  overdue: 'Vencida',
  cancelled: 'Cancelada',
};

export const TASK_STATUS_TONES: Readonly<Record<TaskStatus, Tone>> = {
  pending: 'neutral',
  in_progress: 'info',
  completed: 'success',
  overdue: 'destructive',
  cancelled: 'neutral',
};

export const PRIORITY_LABELS: Readonly<Record<TaskPriority, string>> = {
  low: 'Baja',
  normal: 'Normal',
  high: 'Alta',
  urgent: 'Urgente',
};

export const PRIORITY_TONES: Readonly<Record<TaskPriority, Tone>> = {
  low: 'neutral',
  normal: 'neutral',
  high: 'warning',
  urgent: 'destructive',
};

/** Por qué la tarea llegó a la bandeja de la persona. */
export const REASON_LABELS: Readonly<Record<TaskReason, string>> = {
  assigned: 'Asignada a usted',
  role: 'Para su rol',
  delegation: 'Por delegación',
  escalation: 'Escalada a usted',
  unassigned: 'Sin responsable',
};

export const STATE_KIND_LABELS: Readonly<Record<StateKind, string>> = {
  initial: 'Inicial',
  normal: 'Normal',
  approval: 'De aprobación',
  final: 'Final',
};

export const DEFINITION_STATUS_LABELS: Readonly<Record<DefinitionStatus, string>> = {
  draft: 'Borrador',
  published: 'Publicada',
  retired: 'Retirada',
};

export const DEFINITION_STATUS_TONES: Readonly<Record<DefinitionStatus, Tone>> = {
  draft: 'warning',
  published: 'success',
  retired: 'neutral',
};

export const CONDITION_OPERATORS = [
  { value: 'eq', label: 'es igual a' },
  { value: 'neq', label: 'es distinto de' },
  { value: 'gt', label: 'es mayor que' },
  { value: 'gte', label: 'es mayor o igual que' },
  { value: 'lt', label: 'es menor que' },
  { value: 'lte', label: 'es menor o igual que' },
] as const;

/** Nombre de una persona para mostrar: su nombre, o su correo si no lo tiene. */
export function personName(
  person: {
    readonly display_name: string | null;
    readonly email: string;
  } | null,
): string {
  if (person === null) return '—';
  return person.display_name ?? person.email;
}
