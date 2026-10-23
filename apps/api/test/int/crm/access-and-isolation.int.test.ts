import {
  campaignListResponseSchema,
  funnelReportSchema,
  leadListResponseSchema,
  opportunityListResponseSchema,
} from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import type { Person } from '../iam/support/access-scenario.js';
import { errorCode } from '../iam/support/iam-fixtures.js';
import { CrmScenario } from './support/crm-scenario.js';

// Permiso denegado y aislamiento entre empresas del CRM (B22, capítulo 21 y numeral 15.5).

const scenario = new CrmScenario('crm acceso');

const READS = [
  '/v1/crm/leads',
  '/v1/crm/opportunities',
  '/v1/crm/activities',
  '/v1/crm/campaigns',
  '/v1/crm/reports/funnel',
];

describe('permiso denegado', () => {
  it('el colaborador, SST, talento humano y el portal no ven nada del CRM', async () => {
    const people = [
      await scenario.person('colaborador', ['COLABORADOR']),
      await scenario.person('sst', ['SST']),
      await scenario.person('talento', ['TALENTO_HUMANO']),
      await scenario.person('portal', ['CLIENTE_ADMIN'], { kind: 'portal' }),
    ];
    for (const person of people) {
      for (const path of READS) {
        expect(errorCode(await scenario.get(path, person.session)), path).toBe('PERMISSION_DENIED');
      }
    }
  });
});

describe('permiso denegado', () => {
  it('Dirección y Calidad leen pero no registran, editan ni cierran', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const opportunityId = await scenario.opportunity(sales);
    for (const role of ['DIRECCION', 'CALIDAD'] as const) {
      const reader = await scenario.person(role.toLowerCase(), [role]);
      expect((await scenario.get('/v1/crm/leads', reader.session)).status).toBe(200);
      const writes = [
        scenario.post('/v1/crm/leads', reader.session, await scenario.leadBody()),
        scenario.action(`/v1/crm/leads/${leadId}/actions/qualify`, reader, 1),
        scenario.action(`/v1/crm/opportunities/${opportunityId}/actions/win`, reader, 1),
        scenario.post('/v1/crm/campaigns', reader.session, { name: 'X', channel: 'email' }),
        scenario.post('/v1/crm/activities', reader.session, {
          lead_id: leadId,
          type: 'call',
          subject: 'Llamada',
          due_at: '2026-12-01T15:00:00Z',
        }),
      ];
      for (const response of await Promise.all(writes)) {
        expect(errorCode(response)).toBe('PERMISSION_DENIED');
      }
    }
  });
});

/** Lo que ve la persona en las listas y el informe del CRM. */
async function listsOf(person: Person) {
  const read = async (path: string): Promise<unknown> =>
    (await scenario.get(path, person.session)).body;
  return {
    leads: leadListResponseSchema.parse(await read('/v1/crm/leads')),
    opportunities: opportunityListResponseSchema.parse(
      await read('/v1/crm/opportunities?view=all'),
    ),
    campaigns: campaignListResponseSchema.parse(await read('/v1/crm/campaigns')),
    report: funnelReportSchema.parse(await read('/v1/crm/reports/funnel')),
  };
}

describe('aislamiento entre empresas', () => {
  it('otra empresa no ve ni cambia los registros de esta', async () => {
    const sales = await scenario.sales();
    const leadId = await scenario.lead(sales);
    const opportunityId = await scenario.opportunity(sales);
    await scenario.create('/v1/crm/campaigns', sales, {
      name: `Feria ${String(Date.now())}`,
      channel: 'event',
      starts_on: '2026-10-01',
    });
    const other = await scenario.sales(scenario.otherTenant.id);
    const missing = [
      scenario.get(`/v1/crm/leads/${leadId}`, other.session),
      scenario.get(`/v1/crm/opportunities/${opportunityId}`, other.session),
      scenario.action(`/v1/crm/leads/${leadId}/actions/qualify`, other, 1),
      scenario.action(`/v1/crm/opportunities/${opportunityId}/actions/lose`, other, 1, {
        reason: 'PRICE',
      }),
    ];
    for (const response of await Promise.all(missing)) {
      expect(errorCode(response)).toBe('CRM_NOT_FOUND');
    }
    const { leads, opportunities, campaigns, report } = await listsOf(other);
    expect(leads.data.map((row) => row.id)).not.toContain(leadId);
    expect(opportunities.data.map((row) => row.id)).not.toContain(opportunityId);
    expect(campaigns.data.every((row) => !row.name.startsWith('Feria'))).toBe(true);
    expect(report.rows.map((row) => row.code)).not.toContain(
      (await scenario.opportunityDetail(sales, opportunityId)).code,
    );
  });
});

describe('aislamiento entre empresas', () => {
  it('un prospecto no toma la persona de otra empresa', async () => {
    const sales = await scenario.sales();
    const foreign = await scenario.party(
      await scenario.sales(scenario.otherTenant.id),
      await scenario.personWithConsent({}, scenario.otherTenant.id),
    );
    const response = await scenario.post(
      '/v1/crm/leads',
      sales.session,
      await scenario.leadBody({ person: null, party_id: foreign }),
    );
    expect(errorCode(response)).toBe('CRM_PARTY_INVALID');
  });
});
