import type { StateInput, TransitionInput } from '@arza/contracts';

import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { seedPublishedFlow } from './flow-seed.js';

// Flujo de demostración «Solicitud de prueba» (B15), solo con los datos ficticios (`pnpm
// db:seed:demo`, nunca en producción). Ensaya todo el motor: condición por monto, aprobación en
// serie (jefe inmediato y luego Calidad), en paralelo (Dirección y Finanzas), devolución y
// cancelación con comentario.

const KEY = 'demo.request';
const LIMIT = 5_000_000;

function state(key: string, label: string, kind: StateInput['kind'], extra: Partial<StateInput>) {
  const base = { key, label, kind, sla_hours: null, priority: 'normal' } as const;
  return { ...base, assignee: null, approval: null, ...extra } satisfies StateInput;
}

const STATES: StateInput[] = [
  state('draft', 'Borrador', 'initial', { sla_hours: 8, assignee: { type: 'initiator' } }),
  state('review', 'Revisión del jefe y de Calidad', 'approval', {
    sla_hours: 16,
    priority: 'high',
    approval: {
      mode: 'serial',
      approvers: [{ type: 'supervisor' }, { type: 'role', role: 'CALIDAD' }],
    },
  }),
  state('direction', 'Aprobación de Dirección y Finanzas', 'approval', {
    sla_hours: 16,
    priority: 'urgent',
    approval: {
      mode: 'parallel',
      approvers: [
        { type: 'role', role: 'DIRECCION' },
        { type: 'role', role: 'ADMIN_FINANCIERO' },
      ],
    },
  }),
  state('approved', 'Aprobada', 'final', {}),
  state('rejected', 'Rechazada', 'final', {}),
  state('cancelled', 'Cancelada', 'final', {}),
];

function transition(from: string, to: string, action: string, label: string) {
  return {
    from_state: from,
    to_state: to,
    action,
    label,
    required_permission: null,
    condition: null,
    requires_comment: false,
  } satisfies TransitionInput;
}

const TRANSITIONS: TransitionInput[] = [
  {
    ...transition('draft', 'review', 'submit', 'Enviar a revisión'),
    condition: [{ fact: 'amount', op: 'lte', value: LIMIT }],
  },
  {
    ...transition('draft', 'direction', 'submit_direction', 'Enviar a Dirección'),
    condition: [{ fact: 'amount', op: 'gt', value: LIMIT }],
  },
  { ...transition('draft', 'cancelled', 'cancel', 'Cancelar'), requires_comment: true },
  transition('review', 'approved', 'approve', 'Aprobar'),
  transition('review', 'draft', 'reject', 'Devolver para corregir'),
  transition('direction', 'approved', 'approve', 'Aprobar'),
  transition('direction', 'rejected', 'reject', 'Rechazar'),
];

/** Crea y publica el flujo de demostración en cada empresa que aún no lo tiene. */
export async function seedWorkflowDemo(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  const flow = {
    key: KEY,
    name: 'Solicitud de prueba',
    description: `Hasta $${LIMIT.toLocaleString('es-CO')} la revisan el jefe y Calidad; más, Dirección y Finanzas.`,
    entityType: KEY,
    states: STATES,
    transitions: TRANSITIONS,
    auditAction: 'wf.demo.seed',
  };
  for (const tenantId of tenantIds) {
    const context = { tenantId, userId: null, meta: null, at: clock.now() };
    await database.withTenant({ tenantId, userId: null }, async (tx) => {
      await seedPublishedFlow(tx, context, flow);
    });
  }
}
