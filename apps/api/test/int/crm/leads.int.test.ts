import { leadListResponseSchema } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { auditActions, errorCode, tenantScope } from '../iam/support/iam-fixtures.js';
import { CrmScenario } from './support/crm-scenario.js';

// Prospectos (B22, ficha 17.6): la persona queda como tercero «prospecto» con su autorización, el
// rol Comercial recibe la tarea de contacto, y el prospecto se califica, se descarta o se convierte.

const scenario = new CrmScenario('crm prospectos');

describe('registro del prospecto', () => {
  it('guarda la persona sin documento, su autorización, el código y la tarea de contacto', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales, { company_name: 'Andina S.A.S.' });
    const lead = await scenario.leadDetail(sales, id);
    expect(lead).toMatchObject({
      status: 'new',
      company_name: 'Andina S.A.S.',
      source: { code: 'WEBSITE', label: 'Sitio web' },
      owner: { id: sales.id },
      consent: { purposes: ['COMMERCIAL'], granted_on: '2026-10-01' },
    });
    expect(lead.code).toMatch(/^LEA-\d{4}-\d{4}$/u);
    const party = await scenario.detail(sales, lead.person.id);
    expect(party).toMatchObject({ status: 'prospect', id_type: null, id_number: null });
    const consent = await tenantScope(
      scenario.db,
      scenario.tenant.id,
    )((tx) => tx.privacyConsent.findUniqueOrThrow({ where: { id: lead.consent.id } }));
    expect(consent.source).toBe('crm_lead');
    const { tasks } = await scenario.contactTasks(id);
    expect(tasks).toMatchObject([{ status: 'pending', assigneeRole: 'COMERCIAL' }]);
    expect(await auditActions(scenario.db, scenario.tenant.id, id)).toEqual([
      'crm.lead.create:success',
    ]);
  });
});

describe('registro del prospecto', () => {
  it('también toma una persona ya registrada en Terceros', async () => {
    const sales = await scenario.sales();
    const personId = await scenario.party(sales, await scenario.personWithConsent());
    const id = await scenario.lead(sales, { person: null, party_id: personId });
    expect((await scenario.leadDetail(sales, id)).person.id).toBe(personId);
  });
});

describe('registro del prospecto', () => {
  it('una organización no es la persona de un prospecto, y el origen debe existir', async () => {
    const sales = await scenario.sales();
    const orgId = await scenario.party(sales);
    const org = await scenario.post(
      '/v1/crm/leads',
      sales.session,
      await scenario.leadBody({ person: null, party_id: orgId }),
    );
    expect(errorCode(org)).toBe('CRM_PARTY_INVALID');
    const source = await scenario.post(
      '/v1/crm/leads',
      sales.session,
      await scenario.leadBody({ source: 'NO_EXISTE' }),
    );
    expect(errorCode(source)).toBe('CRM_CATALOG_VALUE_INVALID');
  });
});

describe('registro del prospecto', () => {
  it('sin autorización marcada no se guarda', async () => {
    const sales = await scenario.sales();
    const body = await scenario.leadBody();
    const response = await scenario.post('/v1/crm/leads', sales.session, {
      ...body,
      consent: { ...(body as { consent: object }).consent, accepted: false },
    });
    expect(response.status).toBe(422);
  });
});

describe('registro del prospecto', () => {
  it('la lista busca por el nombre de la persona y filtra por estado', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const lead = await scenario.leadDetail(sales, id);
    const surname = lead.person.name.split(' ').at(-1) ?? '';
    const response = await scenario.get(
      `/v1/crm/leads?status=new&q=${encodeURIComponent(surname)}`,
      sales.session,
    );
    expect(leadListResponseSchema.parse(response.body).data.map((row) => row.id)).toEqual([id]);
  });
});

describe('calificar, descartar y convertir', () => {
  it('calificar cierra la tarea de contacto', async () => {
    const sales = await scenario.sales();
    const lead = await scenario.qualifiedLead(sales);
    expect(lead.status).toBe('qualified');
    expect(lead.qualified_at).not.toBeNull();
    const { instance, tasks } = await scenario.contactTasks(lead.id);
    expect(instance?.currentState).toBe('qualified');
    expect(tasks.map((task) => task.status)).toEqual(['completed']);
  });
});

describe('calificar, descartar y convertir', () => {
  it('descartar exige un motivo de la lista y cierra la tarea con él', async () => {
    const sales = await scenario.sales();
    const id = await scenario.lead(sales);
    const lead = await scenario.leadDetail(sales, id);
    const path = `/v1/crm/leads/${id}/actions/discard`;
    const bad = await scenario.action(path, sales, lead.version, { reason: 'NADA' });
    expect(errorCode(bad)).toBe('CRM_CATALOG_VALUE_INVALID');
    const body = { reason: 'NOT_TARGET', note: 'Busca un producto que no ofrecemos.' };
    expect((await scenario.action(path, sales, lead.version, body)).status).toBe(204);
    const after = await scenario.leadDetail(sales, id);
    expect(after).toMatchObject({
      status: 'discarded',
      discard_reason: { code: 'NOT_TARGET', label: 'No es cliente objetivo' },
    });
    expect((await scenario.contactTasks(id)).instance?.currentState).toBe('discarded');
  });
});

describe('calificar, descartar y convertir', () => {
  it('convertir crea la oportunidad y cierra el prospecto', async () => {
    const sales = await scenario.sales();
    const lead = await scenario.qualifiedLead(sales);
    const response = await scenario.action(
      `/v1/crm/leads/${lead.id}/actions/convert`,
      sales,
      lead.version,
      {
        party_id: lead.person.id,
        title: 'Portal de autogestión',
        estimated_value: '12000000.50',
        expected_close: '2026-12-01',
      },
    );
    expect(response.status, response.text).toBe(201);
    const after = await scenario.leadDetail(sales, lead.id);
    expect(after.status).toBe('converted');
    const opportunity = await scenario.opportunityDetail(sales, after.opportunity?.id ?? '');
    expect(opportunity).toMatchObject({
      stage: 'prospecting',
      probability: 10,
      estimated_value: '12000000.50',
      weighted_value: '1200000.05',
      lead: { id: lead.id },
    });
    expect(await auditActions(scenario.db, scenario.tenant.id, lead.id)).toEqual([
      'crm.lead.create:success',
      'crm.lead.qualify:success',
      'crm.lead.convert:success',
    ]);
  });
});
