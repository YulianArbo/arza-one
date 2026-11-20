import type { PortalProjectSummary } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { mainProject } from './portal-home-cards';

function project(
  id: string,
  status: PortalProjectSummary['status'],
  due?: string,
): PortalProjectSummary {
  return {
    id,
    code: id,
    name: id,
    status,
    starts_on: '2026-01-01',
    ends_on: '2026-12-31',
    progress_pct: 10,
    next_milestone: due === undefined ? null : { id, name: 'Hito', due_on: due, status: 'pending' },
    awaiting_client: 0,
  };
}

describe('proyecto que se destaca en el inicio del cliente (B22B)', () => {
  it('elige el abierto con el hito más cercano, y nunca uno cerrado si hay abiertos', () => {
    const projects = [
      project('cerrado', 'closed', '2026-01-05'),
      project('lejano', 'in_progress', '2026-12-01'),
      project('sin-hito', 'planning'),
      project('cercano', 'at_risk', '2026-11-25'),
    ];
    expect(mainProject(projects)?.id).toBe('cercano');
  });

  it('sin hitos, el primero abierto; solo cerrados, el primero; sin proyectos, ninguno', () => {
    expect(mainProject([project('a', 'closed'), project('b', 'planning')])?.id).toBe('b');
    expect(mainProject([project('a', 'closed')])?.id).toBe('a');
    expect(mainProject([])).toBeUndefined();
  });
});
