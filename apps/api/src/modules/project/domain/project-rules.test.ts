import { describe, expect, it } from 'vitest';

import {
  billingExceeds,
  canTakeStep,
  parentAllowed,
  periodProblem,
  progressOf,
  sprintPeriodProblem,
} from './project-rules.js';

// Reglas de Proyectos (B26, ficha 17.8).

const project = { startsOn: '2026-11-01', endsOn: '2027-02-28' };

describe('estados del proyecto', () => {
  it('se inicia desde planeación y se reanuda desde riesgo o pausa', () => {
    expect(canTakeStep('start', 'planning')).toBe(true);
    expect(canTakeStep('start', 'in_progress')).toBe(false);
    expect(canTakeStep('resume', 'paused')).toBe(true);
    expect(canTakeStep('resume', 'in_progress')).toBe(false);
  });

  it('no se pausa ni se marca en riesgo lo que no ha empezado', () => {
    expect(canTakeStep('pause', 'planning')).toBe(false);
    expect(canTakeStep('risk', 'paused')).toBe(false);
    expect(canTakeStep('pause', 'at_risk')).toBe(true);
  });
});

describe('fechas', () => {
  it('un periodo no termina antes de empezar', () => {
    expect(periodProblem({ startsOn: '2026-11-02', endsOn: '2026-11-01' }, 'El proyecto')).toBe(
      'El proyecto no puede terminar antes de empezar.',
    );
    expect(periodProblem(project, 'El proyecto')).toBeNull();
  });

  it('la iteración queda dentro de las fechas del proyecto', () => {
    expect(sprintPeriodProblem({ startsOn: '2026-11-03', endsOn: '2026-11-17' }, project)).toBe(
      null,
    );
    expect(sprintPeriodProblem({ startsOn: '2026-10-30', endsOn: '2026-11-10' }, project)).toBe(
      'La iteración debe quedar entre el 01/11/2026 y el 28/02/2027, las fechas del proyecto.',
    );
  });
});

describe('hitos', () => {
  it('entre todos facturan como máximo el 100 %, sin errores de redondeo', () => {
    expect(billingExceeds(['33.33', '33.33'], '33.34')).toBe(false);
    expect(billingExceeds(['50.00', '40.00'], '10.01')).toBe(true);
    expect(billingExceeds([], 100)).toBe(false);
  });
});

describe('ítems', () => {
  it('la épica agrupa historias; la historia, tareas y defectos', () => {
    expect(parentAllowed('story', 'epic')).toBe(true);
    expect(parentAllowed('task', 'story')).toBe(true);
    expect(parentAllowed('epic', 'epic')).toBe(false);
    expect(parentAllowed('story', 'task')).toBe(false);
    expect(parentAllowed('defect', 'defect')).toBe(false);
  });

  it('el avance son los terminados sobre los planeados', () => {
    expect(progressOf(0, 0)).toEqual({ planned: 0, done: 0, percent: 0 });
    expect(progressOf(3, 1)).toEqual({ planned: 3, done: 1, percent: 33 });
    expect(progressOf(4, 4).percent).toBe(100);
  });
});
