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

/** Otra pasada termina primero: deja los contratos con PDF listo, sin archivo de esta pasada. */
function otherPassFinishes(ids: readonly string[]): Promise<unknown> {
  return scenario.db.withTenant(tenantTx(), (tx) =>
    tx.ctrContract.updateMany({ where: { id: { in: [...ids] } }, data: { pdfStatus: 'ready' } }),
  );
}

describe('PDF de contratos con dos pasadas del worker', () => {
  it('la pasada que llega tarde descarta su PDF y no toca los contratos', async () => {
    const sales = await scenario.sales();
    const ids = [await approvedWithoutPdf(sales), await approvedWithoutPdf(sales)];
    const before = await pdfCount();
    await renderPendingContracts({
      database: apiDatabase(),
      clock: scenario.clock,
      storage: storage(),
      convertHtml: async () => {
        await otherPassFinishes(ids);
        return samplePdf('Contrato');
      },
    });
    const contracts = await scenario.db.withTenant(tenantTx(), (tx) =>
      tx.ctrContract.findMany({ where: { id: { in: ids } } }),
    );
    expect(contracts.map((contract) => contract.pdfStatus)).toEqual(['ready', 'ready']);
    const withFile = contracts.filter((contract) => contract.pdfFileId !== null).length;
    expect(await pdfCount()).toBe(before + withFile);
  });

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
