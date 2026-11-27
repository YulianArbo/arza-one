import {
  dashboardDataResponseSchema,
  drilldownResponseSchema,
  type DashboardData,
  type DashboardFigure,
  type Drilldown,
  type FigureKey,
} from '@arza/contracts';
import { expect } from 'vitest';

import type { AccessScenario, Person } from '../../iam/support/access-scenario.js';

// Lecturas de los tableros de la Dirección para las pruebas (B46).

export type Board = 'executive' | 'compliance';

export async function board(s: AccessScenario, person: Person, key: Board): Promise<DashboardData> {
  const response = await s.get(`/v1/dashboards/${key}/data`, person.session);
  expect(response.status, response.text).toBe(200);
  return dashboardDataResponseSchema.parse(response.body);
}

export function figure(data: DashboardData, key: FigureKey): DashboardFigure {
  const found = data.figures.find((item) => item.key === key);
  if (found === undefined) throw new Error(`Falta la cifra ${key}`);
  return found;
}

export async function drilldown(
  s: AccessScenario,
  person: Person,
  key: Board,
  figureKey: FigureKey,
): Promise<Drilldown> {
  const response = await s.get(
    `/v1/dashboards/${key}/drilldown?figure=${figureKey}`,
    person.session,
  );
  expect(response.status, response.text).toBe(200);
  return drilldownResponseSchema.parse(response.body);
}
