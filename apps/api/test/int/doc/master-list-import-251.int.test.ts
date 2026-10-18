import { beforeAll, describe, expect, it } from 'vitest';

import { summaryLines } from '../../../src/modules/doc/interface/cli/import-report.js';
import type { Person } from '../iam/support/access-scenario.js';
import {
  ImportScenario,
  listingCsv,
  memoryFiles,
  type ListingRow,
} from './support/import-scenario.js';

// Criterio del bloque (ficha 17.4 y numeral 18.2): tras la carga inicial, el Listado Maestro en la
// plataforma coincide con RE-SGC-001: 251 documentos vigentes. Con un listado ficticio de 251
// filas en esta empresa de prueba, que no tiene otros documentos del SGC.

const scenario = new ImportScenario('carga de 251 documentos');

const PROCESSES = ['DG', 'SGC', 'INN', 'COM', 'TEC', 'SAC', 'FIN', 'ADM', 'GTH', 'SST'];
const TYPES = ['MN', 'PR', 'PL', 'PT', 'IN', 'FT', 'RE'];

/** 250 documentos repartidos por proceso y tipo, y el RIT-001: 251 en total. */
function listingRows(): ListingRow[] {
  const rows: ListingRow[] = [];
  for (let index = 0; index < 250; index += 1) {
    const process = PROCESSES[index % PROCESSES.length] ?? 'SGC';
    const type = TYPES[Math.floor(index / PROCESSES.length) % TYPES.length] ?? 'PR';
    const number = Math.floor(index / (PROCESSES.length * TYPES.length)) + 1;
    rows.push({
      code: `${type}-${process}-${String(number).padStart(3, '0')}`,
      title: `Documento ${type} de ${process} número ${String(number)}`,
      version: String(index % 4).padStart(2, '0'),
      date: `${String((index % 28) + 1).padStart(2, '0')}/0${String((index % 9) + 1)}/2025`,
    });
  }
  rows.push({
    code: 'RIT-001',
    title: 'Reglamento Interno de Trabajo',
    version: '02',
    date: '01/02/2024',
  });
  return rows;
}

const ROWS = listingRows();
const CODES = ROWS.map((row) => row.code);
const WORDS = CODES.filter((_, index) => index % 50 === 0);
let quality: Person;

beforeAll(async () => {
  await scenario.seed();
  quality = await scenario.quality('carga');
}, 120_000);

describe('carga inicial del Listado Maestro (criterio del bloque)', () => {
  it('carga los 251 vigentes y la plataforma coincide con el listado, sin diferencias', async () => {
    expect(new Set(CODES).size).toBe(251);
    const report = await scenario.importUntilDone(
      quality,
      listingCsv(ROWS),
      memoryFiles(CODES, WORDS),
    );
    expect(report.problems).toEqual([]);
    expect(report.waiting).toBe(0);
    expect(report.current).toBe(251);
    expect(report.differences).toEqual([]);
    expect(summaryLines(report, true)).toContain('Vigentes cargados: 251');
    const listed = await scenario.masterList(quality);
    expect(listed).toHaveLength(251);
    const byCode = new Map(listed.map((entry) => [entry.code, entry]));
    for (const row of ROWS) {
      const entry = byCode.get(row.code);
      expect(entry?.version_label).toBe(row.version);
      expect(entry?.title).toBe(row.title);
      const [day, month, year] = row.date.split('/');
      expect(entry?.effective_date).toBe(`${year ?? ''}-${month ?? ''}-${day ?? ''}`);
    }
  }, 600_000);

  it('una corrida más no duplica nada y sigue sin diferencias', async () => {
    const report = await scenario.runImport(quality, listingCsv(ROWS), memoryFiles(CODES, WORDS));
    expect(report).toMatchObject({ uploaded: 0, created: 0, published: 0, current: 251 });
    expect(report.differences).toEqual([]);
    const documents = await scenario.inTenant((tx) =>
      tx.docDocument.count({ where: { isControlled: true } }),
    );
    expect(documents).toBe(251);
  }, 300_000);

  it('la exportación trae las mismas 251 filas', async () => {
    const response = await scenario.post('/v1/master-list/export', quality.session);
    expect(response.status, response.text).toBe(200);
    const lines = response.text.trim().split('\r\n');
    expect(lines).toHaveLength(252);
  });
});
