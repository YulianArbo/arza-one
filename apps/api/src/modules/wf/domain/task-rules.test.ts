import { describe, expect, it } from 'vitest';

import {
  canHandOver,
  inboxOrder,
  isOpen,
  needsOwner,
  taskReason,
  type TaskActor,
  type TaskAssignment,
} from './task-rules.js';

// Quién atiende cada tarea (B15): responsable, rol, delegación, escalamiento o sin responsable.

const ME = '0192f3a1-0000-7000-8000-000000000001';
const BOSS = '0192f3a1-0000-7000-8000-000000000002';
const OTHER = '0192f3a1-0000-7000-8000-000000000003';

const TASK: TaskAssignment = {
  kind: 'approval',
  status: 'pending',
  assigneeId: OTHER,
  assigneeRole: null,
  requiredPermission: 'doc.version.approve',
  escalatedToId: null,
  escalatedAt: null,
};

const ACTOR: TaskActor = {
  userId: ME,
  roleCodes: new Set(['CALIDAD']),
  delegations: new Map(),
  canReassign: false,
};

describe('quién atiende una tarea', () => {
  it('su responsable', () => {
    expect(taskReason({ ...TASK, assigneeId: ME }, ACTOR)).toBe('assigned');
    expect(taskReason(TASK, ACTOR)).toBeNull();
  });

  it('cualquiera con el rol mientras nadie la toma', () => {
    const roleTask = { ...TASK, assigneeId: null, assigneeRole: 'CALIDAD' };
    expect(taskReason(roleTask, ACTOR)).toBe('role');
    expect(taskReason({ ...roleTask, assigneeRole: 'SST' }, ACTOR)).toBeNull();
  });

  it('quien recibió la delegación de esa aprobación (B10)', () => {
    const delegations = new Map([[OTHER, new Set(['doc.version.approve'] as const)]]);
    expect(taskReason(TASK, { ...ACTOR, delegations })).toBe('delegation');
    expect(taskReason({ ...TASK, requiredPermission: null }, { ...ACTOR, delegations })).toBeNull();
    expect(taskReason({ ...TASK, kind: 'action' }, { ...ACTOR, delegations })).toBeNull();
  });
});

describe('quién atiende una tarea vencida o sin responsable', () => {
  it('el jefe inmediato a quien se escaló', () => {
    const escalated = {
      ...TASK,
      status: 'overdue',
      escalatedToId: ME,
      escalatedAt: new Date(),
    } as const;
    expect(taskReason(escalated, ACTOR)).toBe('escalation');
  });

  it('quien reasigna tareas atiende las que no tienen a quién llegar', () => {
    const orphan = { ...TASK, assigneeId: null };
    const escalatedToNobody = { ...TASK, status: 'overdue', escalatedAt: new Date() } as const;
    expect(needsOwner(orphan)).toBe(true);
    expect(needsOwner(escalatedToNobody)).toBe(true);
    expect(needsOwner({ ...TASK, escalatedToId: BOSS, escalatedAt: new Date() })).toBe(false);
    expect(taskReason(orphan, { ...ACTOR, canReassign: true })).toBe('unassigned');
    expect(taskReason(orphan, ACTOR)).toBeNull();
  });

  it('nadie atiende una tarea cerrada', () => {
    for (const status of ['completed', 'cancelled'] as const) {
      expect(isOpen(status)).toBe(false);
      expect(taskReason({ ...TASK, status, assigneeId: ME }, ACTOR)).toBeNull();
    }
    expect(isOpen('overdue')).toBe(true);
  });

  it('solo el responsable o quien la tiene por su rol la entrega a otra persona', () => {
    expect(canHandOver('assigned')).toBe(true);
    expect(canHandOver('role')).toBe(true);
    expect(canHandOver('delegation')).toBe(false);
    expect(canHandOver(null)).toBe(false);
  });
});

describe('orden de «Mis tareas»', () => {
  it('vencidas primero, luego por vencimiento y por prioridad', () => {
    const at = (iso: string) => new Date(iso);
    const tasks = [
      { id: 'sin plazo', status: 'pending', priority: 'urgent', dueAt: null },
      { id: 'mañana', status: 'pending', priority: 'low', dueAt: at('2026-10-16T13:00:00Z') },
      { id: 'vencida', status: 'overdue', priority: 'low', dueAt: at('2026-10-14T13:00:00Z') },
      {
        id: 'hoy normal',
        status: 'pending',
        priority: 'normal',
        dueAt: at('2026-10-15T20:00:00Z'),
      },
      {
        id: 'hoy alta',
        status: 'in_progress',
        priority: 'high',
        dueAt: at('2026-10-15T20:00:00Z'),
      },
    ] as const;
    expect([...tasks].sort(inboxOrder).map((task) => task.id)).toEqual([
      'vencida',
      'hoy alta',
      'hoy normal',
      'mañana',
      'sin plazo',
    ]);
  });
});
