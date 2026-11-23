import { cookieReportSchema } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { businessDeadline } from '../../../src/modules/core/index.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { INCIDENTS, RequestScenario } from './support/request-scenario.js';

// Incidentes con datos personales (B42; numeral 15.7; decisión 9): plazo de 15 días hábiles para
// reportarlos a la SIC, contención, bitácora de medidas, reporte, aviso a los titulares y cierre
// con el reporte hecho o con el motivo para no reportar. Y el informe de cookies del sitio.

const scenario = new RequestScenario('privacidad incidentes');

describe('incidentes', () => {
  it('se registra con su fecha límite para la SIC y recorre sus estados', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.incident(dpo, { data_categories: ['contact', 'health'] });
    const opened = await scenario.incidentDetail(dpo, id);
    const expected = await scenario.inTenant((tx) => businessDeadline(tx, scenario.today(), 15));
    expect(opened.sic_due_on).toBe(expected);
    expect(opened.code).toMatch(/^IDP-\d{4}-\d{4,}$/);
    expect(opened.sensitive).toBe(true);
    const base = `${INCIDENTS}/${id}`;
    const contained = await scenario.act(`${base}/actions/contain`, dpo.session, 1, {
      note: 'Se pidió al destinatario borrar el correo.',
    });
    expect(contained.status, contained.text).toBe(204);
    const measure = {
      description: 'Se revisó la lista de distribución.',
      taken_on: scenario.today(),
    };
    expect((await scenario.act(`${base}/measures`, dpo.session, 2, measure)).status).toBe(204);
    const report = { reported_on: scenario.today(), reference: 'SIC-2026-000999' };
    expect((await scenario.act(`${base}/actions/report`, dpo.session, 3, report)).status).toBe(204);
    expect((await scenario.act(`${base}/actions/close`, dpo.session, 4, {})).status).toBe(204);
    const closed = await scenario.incidentDetail(dpo, id);
    expect(closed.status).toBe('closed');
    expect(closed.measures).toHaveLength(1);
    expect(closed.sic_reference).toBe('SIC-2026-000999');
  });
});

describe('incidentes', () => {
  it('cerrar sin reportar exige el motivo', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.incident(dpo);
    const close = await scenario.act(`${INCIDENTS}/${id}/actions/close`, dpo.session, 1, {});
    expect(errorCode(close)).toBe('PRIVACY_INCIDENT_STEP_INVALID');
    const reason = { not_reportable_reason: 'El archivo estaba cifrado: no hubo exposición.' };
    const ok = await scenario.act(`${INCIDENTS}/${id}/actions/close`, dpo.session, 1, reason);
    expect(ok.status, ok.text).toBe(204);
  });
});

describe('incidentes', () => {
  it('una fecha de reporte anterior a la detección o una versión vieja se rechazan', async () => {
    const dpo = await scenario.officer();
    const id = await scenario.incident(dpo);
    const early = { reported_on: '2020-01-01', reference: 'SIC-ANTES' };
    const before = await scenario.act(`${INCIDENTS}/${id}/actions/report`, dpo.session, 1, early);
    expect(before.status).toBe(422);
    const stale = await scenario.act(`${INCIDENTS}/${id}/actions/contain`, dpo.session, 9, {
      note: 'Contención con otra versión.',
    });
    expect(errorCode(stale)).toBe('VERSION_CONFLICT');
  });
});

describe('incidentes', () => {
  it('una detección futura se rechaza', async () => {
    const dpo = await scenario.officer();
    const future = new Date(scenario.clock.now().getTime() + 86_400_000).toISOString();
    const body = {
      title: 'Incidente del futuro',
      description: 'Una descripción suficiente para el incidente del futuro.',
      detected_at: future,
      affected_count: 1,
      data_categories: ['contact'],
    };
    expect((await scenario.post(INCIDENTS, dpo.session, body)).status).toBe(422);
  });
});

describe('incidentes', () => {
  it('el registro de incidentes se descarga en CSV', async () => {
    const dpo = await scenario.officer();
    await scenario.incident(dpo);
    const csv = await scenario.post(`${INCIDENTS}/export`, dpo.session, {});
    expect(csv.status).toBe(200);
    expect(csv.text).toContain('Fecha límite SIC');
  });
});

describe('cookies', () => {
  it('el informe cuenta por categoría y por versión de la política', async () => {
    const dpo = await scenario.officer();
    const decidedAt = scenario.clock.now();
    await scenario.inTenant(async (tx) => {
      const rows = [['necessary'], ['necessary', 'preferences'], ['necessary']];
      for (const categories of rows) {
        await tx.privacyCookieConsent.create({
          data: {
            tenantId: scenario.tenant.id,
            visitorId: uuidv7(),
            policyVersion: 2,
            categories,
            decidedAt,
            ipTruncated: '10.0.0.0',
          },
        });
      }
    });
    const day = scenario.today();
    const query = `from=${day}&to=${day}`;
    const report = await scenario.get(`/v1/privacy/cookie-consents/report?${query}`, dpo.session);
    expect(report.status, report.text).toBe(200);
    const parsed = cookieReportSchema.parse(report.body);
    expect(parsed.total).toBeGreaterThanOrEqual(3);
    expect(parsed.only_necessary).toBeGreaterThanOrEqual(2);
    expect(
      parsed.by_version.find((item) => item.policy_version === 2)?.count,
    ).toBeGreaterThanOrEqual(3);
    const list = await scenario.get(`/v1/privacy/cookie-consents?${query}`, dpo.session);
    expect(list.status).toBe(200);
  });
});
