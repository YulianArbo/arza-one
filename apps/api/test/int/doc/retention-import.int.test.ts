import { beforeAll, describe, expect, it } from 'vitest';

import { importRetentionTable } from '../../../src/modules/doc/application/retention-import.js';
import { apiDatabase } from '../support/integration-database.js';
import type { Person } from '../iam/support/access-scenario.js';
import { RetentionScenario } from './support/retention-scenario.js';

// Carga de la Tabla de Retención RE-SGC-005 desde su CSV (B21, numeral 18.2, paso 4): revisar sin
// cambiar nada, explicar cada fila con problemas, cargar todo o nada y no duplicar al repetir.

const scenario = new RetentionScenario('carga de la retención');
let quality: Person;

const HEADER = 'Código;Serie;Tipo;Proceso;Años gestión;Años central;Disposición;Fundamento';
const TABLE = [
  HEADER,
  'CON-01;Contratos con clientes;CT;;2;8;Eliminar;Ley 962 de 2005, art. 28',
  'SGC-01;Documentos del SGC;;SGC;1;4;Eliminar;PR-SGC-001',
  'HL;Historias laborales;CT;XYZ;20;60;Conservación total;Decreto 1072 de 2015',
].join('\n');

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('calidad-carga');
});

function load(csv: string, apply: boolean, tenantId = scenario.tenant.id) {
  return importRetentionTable(
    { database: apiDatabase(), clock: scenario.clock },
    { tenantId, userId: quality.id, csv, apply },
  );
}

async function codes(tenantId = scenario.tenant.id): Promise<string[]> {
  const rules = await scenario.db.withTenant({ tenantId, userId: null }, (tx) =>
    tx.docRetentionRule.findMany({ orderBy: { code: 'asc' } }),
  );
  return rules.map((rule) => rule.code);
}

describe('carga del RE-SGC-005', () => {
  it('revisar no cambia nada; con un problema de la empresa no se carga ninguna fila', async () => {
    const reviewed = await load(TABLE, false);
    expect(reviewed).toMatchObject({ read: 3, created: [], existing: [] });
    expect(reviewed.problems).toEqual([
      { row: 4, code: 'HL', problem: 'el proceso XYZ no existe o no está activo' },
    ]);
    const applied = await load(TABLE, true);
    expect(applied.created).toEqual([]);
    expect(await codes()).toEqual([]);
  });

  it('sin problemas crea todas las reglas, con su proceso; repetir no duplica', async () => {
    const valid = TABLE.split('\n').slice(0, 3).join('\n');
    const first = await load(valid, true);
    expect(first).toMatchObject({ read: 2, created: ['CON-01', 'SGC-01'], problems: [] });
    expect(await codes()).toEqual(['CON-01', 'SGC-01']);
    const rules = await scenario.rules(quality);
    const sgc = rules.data.find((rule) => rule.code === 'SGC-01');
    expect(sgc?.process?.code).toBe('SGC');
    const again = await load(valid, true);
    expect(again).toMatchObject({ created: [], existing: ['CON-01', 'SGC-01'] });
    const events = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { action: { startsWith: 'doc.retention_rule.' } } }),
    );
    expect(events.map((event) => event.action).sort()).toEqual([
      'doc.retention_rule.create',
      'doc.retention_rule.create',
      'doc.retention_rule.import',
    ]);
  });

  it('carga solo en la empresa de quien la hace', async () => {
    expect(await codes(scenario.otherTenant.id)).toEqual([]);
  });
});
