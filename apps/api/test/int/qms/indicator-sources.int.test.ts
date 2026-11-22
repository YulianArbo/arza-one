import { AUTOMATIC_SOURCES, type AutomaticSourceKey } from '@arza/contracts';
import { expect, it } from 'vitest';

import {
  calculateSource,
  type MeasuredPeriod,
} from '../../../src/modules/qms/application/indicator-sources.js';
import type {
  ServiceFiguresReader,
  ServiceQualityFigures,
} from '../../../src/modules/qms/application/service-figures.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { monthStart } from './support/qms-b39-fixture.js';
import {
  actionBody,
  coded,
  executed,
  later,
  qualityFixture,
  reported,
  verification,
  at,
  type QualityStaff,
} from './support/qms-fixture.js';

// Los ocho cálculos automáticos de indicadores (B39, decisión 6): con datos dan el valor del
// periodo y sin nada que dividir no dan medición (nunca un 0 % inventado).

const scenario = new AccessScenario('calidad fuentes automaticas');
const SOURCES = Object.keys(AUTOMATIC_SOURCES) as AutomaticSourceKey[];

const NO_SERVICE: ServiceQualityFigures = {
  ticketsResolved: 0,
  ticketsWithinSla: 0,
  pqrsfResponded: 0,
  pqrsfOnTime: 0,
  pqrsfReceived: 0,
  pqrsfWellFounded: 0,
  surveysAnswered: 0,
  satisfactionTotal: 0,
};

function reader(figures: ServiceQualityFigures): ServiceFiguresReader {
  return () => Promise.resolve(figures);
}

function calculate(
  source: AutomaticSourceKey,
  period: MeasuredPeriod,
  figures: ServiceQualityFigures = NO_SERVICE,
): Promise<string | null> {
  return scenario.inTenant((tx) => calculateSource(tx, source, period, reader(figures)));
}

function thisMonth(): MeasuredPeriod {
  return { start: monthStart(scenario, 0), end: monthStart(scenario, -1) };
}

async function verifiedAction(f: QualityStaff, effective: boolean): Promise<string> {
  const body = actionBody({ type: 'improvement', id: null }, f.worker.id, later(scenario, 5));
  const { id } = coded(await scenario.post('/v1/qms/actions', f.quality.session, body));
  expect((await executed(scenario, f.worker, id)).status).toBe(204);
  const verify = `/v1/qms/actions/${id}/actions/verify`;
  const response = await at(scenario, verify, f.verifier, 2, verification(scenario, effective));
  expect(response.status).toBe(204);
  return id;
}

it('sin datos en el periodo no hay medición, y los conteos dan cero', async () => {
  const empty = { start: '2001-01-01', end: '2001-02-01' };
  const results = await Promise.all(SOURCES.map((source) => calculate(source, empty)));
  const bySource = Object.fromEntries(SOURCES.map((key, i) => [key, results[i]]));
  expect(bySource).toEqual({
    qms_actions_effective: null,
    qms_actions_on_time: null,
    qms_open_nonconformities: '0',
    qms_audit_program: null,
    svc_tickets_within_sla: null,
    svc_pqrsf_on_time: null,
    svc_survey_satisfaction: null,
    sst_incidents: '0',
  });
});

it('las cifras de Servicio se vuelven porcentaje y promedio con dos decimales', async () => {
  const figures = {
    ...NO_SERVICE,
    ticketsResolved: 3,
    ticketsWithinSla: 2,
    pqrsfResponded: 4,
    pqrsfOnTime: 4,
    surveysAnswered: 2,
    satisfactionTotal: 9,
  };
  const period = thisMonth();
  expect(await calculate('svc_tickets_within_sla', period, figures)).toBe('66.67');
  expect(await calculate('svc_pqrsf_on_time', period, figures)).toBe('100.00');
  expect(await calculate('svc_survey_satisfaction', period, figures)).toBe('4.50');
});

it('cuenta acciones eficaces, ejecutadas a tiempo y no conformidades abiertas', async () => {
  const f = await qualityFixture(scenario, 'fuentes');
  await verifiedAction(f, true);
  const late = await verifiedAction(f, false);
  await scenario.inTenant((tx) =>
    tx.qmsAction.update({ where: { id: late }, data: { dueOn: new Date('2001-01-01') } }),
  );
  await reported(scenario, f.worker);
  const period = thisMonth();
  expect(await calculate('qms_actions_effective', period)).toBe('50.00');
  expect(await calculate('qms_actions_on_time', period)).toBe('50.00');
  expect(Number(await calculate('qms_open_nonconformities', period))).toBeGreaterThan(0);
});
