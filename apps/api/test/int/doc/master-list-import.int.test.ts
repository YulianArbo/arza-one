import { v7 as uuidv7 } from 'uuid';
import { beforeAll, describe, expect, it } from 'vitest';

import type { ImportReport } from '../../../src/modules/doc/application/master-list-import.js';
import {
  detailLines,
  reportCsv,
  summaryLines,
} from '../../../src/modules/doc/interface/cli/import-report.js';
import {
  ImportScenario,
  listingCsv,
  memoryFiles,
  type ListingRow,
} from './support/import-scenario.js';

// Carga inicial del Listado Maestro (B19, numeral 18.2): revisar sin cambiar nada, explicar cada
// fila con problemas, enlazar los cargos, seguir los consecutivos y no pedir constancias.

const scenario = new ImportScenario('carga inicial');

beforeAll(async () => {
  await scenario.seed();
});

const DATE = '02/03/2025';
const REVIEW_ROWS: ListingRow[] = [
  { code: 'PR-COM-901', title: 'Procedimiento comercial', version: '01', date: DATE },
  { code: 'PR-COM-902', title: 'Sin archivo', version: '00', date: DATE },
  {
    code: 'PR-COM-903',
    title: 'Cargo inexistente',
    version: '00',
    date: DATE,
    owner: 'Astronauta',
  },
  { code: 'PR-ZZZ-904', title: 'Proceso inexistente', version: '00', date: DATE },
  { code: 'PR-COM-905', title: 'Obsoleto', version: '00', date: DATE, status: 'Obsoleto' },
];

async function reviewOnly(): Promise<ImportReport> {
  const quality = await scenario.quality('carga');
  const files = memoryFiles(['PR-COM-901', 'PR-COM-903', 'PR-ZZZ-904', 'PR-COM-905']);
  return scenario.runImport(quality, listingCsv(REVIEW_ROWS), files, false);
}

describe('revisar sin aplicar', () => {
  it('no cambia nada y explica las filas que no se pueden cargar', async () => {
    const report = await reviewOnly();
    expect(report.problems.map((p) => [p.code, p.problem])).toEqual([
      ['PR-COM-902', 'no hay un archivo que empiece por el código'],
      ['PR-COM-903', 'no existe el cargo «Astronauta»'],
      ['PR-ZZZ-904', 'el proceso ZZZ no existe'],
    ]);
    expect(report.skipped.map((p) => p.code)).toEqual(['PR-COM-905']);
    expect(report.uploaded).toBe(0);
    const created = await scenario.inTenant((tx) =>
      tx.docDocument.count({ where: { code: { startsWith: 'PR-COM-90' } } }),
    );
    expect(created).toBe(0);
    expect(report.differences.map((d) => d.code)).toContain('PR-COM-901');
  });

  it('el informe para la consola y el CSV de evidencia dicen lo mismo', async () => {
    const report = await reviewOnly();
    const csv = reportCsv(report, false);
    expect(csv).toContain('3;PR-COM-902;Problema;no hay un archivo que empiece por el código');
    expect(csv).toContain(';PR-COM-905;No se carga;');
    expect(summaryLines(report, false).at(-1)).toMatch(/^Conciliación: \d+ diferencias/u);
    expect(detailLines(report)).toContain('  Fila 4 PR-COM-903: no existe el cargo «Astronauta»');
  });
});

/** Un instructivo con responsable y destinatarios, cargado hasta quedar vigente. */
async function importedWithPositions() {
  const quality = await scenario.quality('carga');
  const owner = `Jefe de prueba ${uuidv7()}`;
  const reader = `Analista de prueba ${uuidv7()}`;
  const ownerId = await scenario.namedPosition(owner);
  const readerId = await scenario.namedPosition(reader);
  const row: ListingRow = {
    code: 'IN-SST-801',
    title: 'Instructivo de trabajo seguro',
    version: '04',
    date: '10/01/2025',
    owner: owner.toUpperCase(),
    targets: `${owner} | ${reader}`,
    classification: 'Confidencial',
  };
  const files = memoryFiles(['IN-SST-801']);
  const report = await scenario.importUntilDone(quality, listingCsv([row]), files);
  const document = await scenario.inTenant((tx) =>
    tx.docDocument.findFirstOrThrow({ where: { code: 'IN-SST-801' }, include: { links: true } }),
  );
  return { quality, report, document, ownerId, readerId };
}

describe('aplicar la carga: cargos', () => {
  it('enlaza el responsable y los destinatarios, y no pide constancias de lectura', async () => {
    const { quality, report, document, ownerId, readerId } = await importedWithPositions();
    expect(report.problems).toEqual([]);
    expect(document).toMatchObject({
      status: 'current',
      ownerPositionId: ownerId,
      classification: 'confidential',
    });
    expect(document.links.map((link) => link.entityId).sort()).toEqual([ownerId, readerId].sort());
    const asked = await scenario.inTenant((tx) =>
      tx.docAcknowledgement.count({ where: { documentId: document.id } }),
    );
    expect(asked).toBe(0);
    const [version] = await scenario.versions(quality, document.id);
    expect(version).toMatchObject({
      origin: 'import',
      label: '04',
      approved_by: null,
      workflow_instance_id: null,
    });
  });
});

describe('aplicar la carga: consecutivos y auditoría', () => {
  it('el siguiente documento nuevo sigue después del número cargado', async () => {
    const quality = await scenario.quality('carga');
    const row = { code: 'PL-TEC-017', title: 'Plan de tecnología', version: '00', date: DATE };
    await scenario.importUntilDone(quality, listingCsv([row]), memoryFiles(['PL-TEC-017']));
    const id = await scenario.createDocument(quality, {
      doc_type: 'PL',
      process_id: await scenario.processId('TEC'),
      folder_id: await scenario.folderId('SGC-TEC'),
    });
    expect((await scenario.document(quality, id)).code).toBe('PL-TEC-018');
  });

  it('cada corrida queda en la auditoría', async () => {
    const quality = await scenario.quality('carga');
    await scenario.runImport(quality, listingCsv([]), memoryFiles([]));
    const runs = await scenario.inTenant((tx) =>
      tx.auditEvent.findMany({ where: { action: 'doc.import.run', actorId: quality.id } }),
    );
    expect(runs).toHaveLength(1);
  });
});
