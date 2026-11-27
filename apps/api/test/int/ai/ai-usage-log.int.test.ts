import { aiRequestListResponseSchema, type AiRequestListResponse } from '@arza/contracts';
import { describe, expect, it } from 'vitest';

import { addDays, bogotaToday } from '../../../src/modules/core/index.js';
import { AccessScenario, type Person } from '../iam/support/access-scenario.js';
import { ask, enable } from './support/ai-fixture.js';

// Registro de usos del asistente (B47, decisión 5): se filtra por uso, resultado y fechas y se
// recorre por páginas, sin perder ni repetir usos.

const s = new AccessScenario('registro de usos ia');

async function log(auditor: Person, query: string): Promise<AiRequestListResponse> {
  const response = await s.get(`/v1/ai/requests?${query}`, auditor.session);
  expect(response.status, response.text).toBe(200);
  return aiRequestListResponseSchema.parse(response.body);
}

describe('registro de usos por páginas y filtros', () => {
  it('recorre las páginas sin repetir y filtra por uso, resultado y fechas', async () => {
    const officer = await s.person('oficial-paginas-ia', ['OFICIAL_DATOS']);
    await enable(s, officer, ['doc_search']);
    const worker = await s.person('colaborador-paginas-ia', ['COLABORADOR']);
    for (const question of ['Primera pregunta', 'Segunda pregunta', 'Tercera pregunta']) {
      await ask(s, worker, question);
    }
    const auditor = await s.person('auditor-paginas-ia', ['AUDITOR']);
    const today = bogotaToday(s.clock.now());

    const first = await log(auditor, 'limit=2');
    expect(first.data).toHaveLength(2);
    expect(first.next_cursor).not.toBeNull();
    const second = await log(auditor, `limit=2&cursor=${first.next_cursor ?? ''}`);
    expect(second.data).toHaveLength(1);
    expect(second.next_cursor).toBeNull();
    const ids = [...first.data, ...second.data].map((row) => row.id);
    expect(new Set(ids).size).toBe(3);

    const outcome = first.data[0]?.outcome ?? 'answered';
    expect((await log(auditor, `use_case=doc_search&outcome=${outcome}`)).data.length).toBe(
      [...first.data, ...second.data].filter((row) => row.outcome === outcome).length,
    );
    expect((await log(auditor, `from=${today}&to=${today}`)).data).toHaveLength(3);
    expect((await log(auditor, `from=${addDays(today, 1)}`)).data).toHaveLength(0);
    expect((await log(auditor, `to=${addDays(today, -1)}`)).data).toHaveLength(0);
  });
});
