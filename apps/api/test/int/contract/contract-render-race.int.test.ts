import { describe, expect, it } from 'vitest';

import { renderPendingContracts } from '../../../src/modules/contract/index.js';
import { storeGeneratedPdf } from '../../../src/modules/doc/index.js';
import { samplePdf, storage } from '../doc/support/file-scenario.js';
import type { Person } from '../iam/support/access-scenario.js';
import { apiDatabase } from '../support/integration-database.js';
import { ContractScenario } from './support/contract-scenario.js';

// Dos pasadas del worker sobre el mismo contrato (B24, B49): la que llega tarde no deja un PDF
// huérfano ni pisa el que ya quedó, y si el amarre falla el archivo se borra. Antes estos casos
// solo se recorrían cuando dos pruebas coincidían por azar. Datos ficticios.

const scenario = new ContractScenario('contratos pasadas cruzadas');

/** Aprobado por la Dirección y a la espera de su PDF. */
async function approvedWithoutPdf(sales: Person): Promise<string> {
  const id = await scenario.contract(sales);
  expect((await scenario.contractStep(sales, id, 'submit')).status).toBe(204);
  const approved = await scenario.contractStep(await scenario.director(), id, 'approve', {});
  expect(approved.status, approved.text).toBe(204);
  return id;
}

function tenantTx() {
  return { tenantId: scenario.tenant.id, userId: null };
}

async function pdfCount(): Promise<number> {
  return scenario.db.withTenant(tenantTx(), (tx) =>
    tx.file.count({ where: { tenantId: scenario.tenant.id, mimeType: 'application/pdf' } }),
  );
}

/** Otra pasada termina primero: cada contrato queda con su PDF, que no es de esta pasada. */
async function otherPassFinishes(sales: Person, ids: readonly string[]): Promise<string[]> {
  const files: string[] = [];
  for (const id of ids) {
    const fileId = await scenario.signedCopy(sales);
    await scenario.db.withTenant(tenantTx(), (tx) =>
      tx.ctrContract.update({
        where: { id },
        data: { pdfStatus: 'ready', pdfFileId: fileId, pdfSha256: '2'.repeat(64) },
      }),
    );
    files.push(fileId);
  }
  return files;
}

describe('PDF de contratos con dos pasadas del worker', () => {
  it('la pasada que llega tarde descarta su PDF y no toca los contratos', async () => {
    const sales = await scenario.sales();
    const ids = [await approvedWithoutPdf(sales), await approvedWithoutPdf(sales)];
    const before = await pdfCount();
    let otherFiles: string[] = [];
    await renderPendingContracts({
      database: apiDatabase(),
      clock: scenario.clock,
      storage: storage(),
      convertHtml: async () => {
        if (otherFiles.length === 0) otherFiles = await otherPassFinishes(sales, ids);
        return samplePdf('Contrato');
      },
    });
    const contracts = await scenario.db.withTenant(tenantTx(), (tx) =>
      tx.ctrContract.findMany({ where: { id: { in: ids } } }),
    );
    expect(contracts.map((contract) => contract.pdfStatus)).toEqual(['ready', 'ready']);
    // Los contratos guardan el PDF de la otra pasada y no queda ningún archivo de más.
    const files = new Set(contracts.map((contract) => contract.pdfFileId));
    expect(files).toEqual(new Set(otherFiles));
    expect(await pdfCount()).toBe(before + otherFiles.length);
  });
});

describe('PDF generado que no se puede amarrar', () => {
  it('si el amarre falla, el error sigue su curso y el archivo se borra', async () => {
    let key = '';
    const store = storeGeneratedPdf(
      { database: apiDatabase(), clock: scenario.clock, storage: storage() },
      { tenantId: scenario.tenant.id, fileName: 'falla.pdf', content: samplePdf('Falla') },
      (_tx, fileId) => {
        key = `${scenario.tenant.id}/${fileId}`;
        return Promise.reject(new Error('El registro no aceptó el PDF'));
      },
    );
    await expect(store).rejects.toThrow('El registro no aceptó el PDF');
    await expect(storage().read(key)).rejects.toThrow();
    const files = await scenario.db.withTenant(tenantTx(), (tx) =>
      tx.file.count({ where: { tenantId: scenario.tenant.id, fileName: 'falla.pdf' } }),
    );
    expect(files).toBe(0);
  });
});
