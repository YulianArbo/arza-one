import { v7 as uuidv7 } from 'uuid';
import { describe, expect, it } from 'vitest';

import { buildOpenApiDocument } from '../../../src/platform/openapi/openapi.js';
import { tenantScope } from '../iam/support/iam-fixtures.js';
import { AccessScenario } from '../iam/support/access-scenario.js';
import { WRITE_ROUTE_CALLS } from './support/write-route-calls.js';

// Criterio de la ficha 17.20 y del capítulo 21: toda operación de escritura de cualquier módulo
// produce su evento de auditoría. Las rutas salen del OpenAPI de la API en marcha: una ruta nueva
// que escribe y no tiene su llamada aquí hace fallar la prueba.

const scenario = new AccessScenario('recorrido de escrituras');
const WRITE_METHODS = ['post', 'put', 'patch', 'delete'] as const;

function writeRoutes(): string[] {
  const { paths } = buildOpenApiDocument(scenario.app);
  return Object.entries(paths).flatMap(([path, item]) =>
    WRITE_METHODS.filter((method) => item[method] !== undefined).map(
      (method) => `${method.toUpperCase()} ${path}`,
    ),
  );
}

async function auditedActions(correlationId: string): Promise<string[]> {
  const tenants = [scenario.tenant.id, scenario.otherTenant.id];
  const found = await Promise.all(
    tenants.map((tenantId) =>
      tenantScope(
        scenario.db,
        tenantId,
      )((tx) => tx.auditEvent.findMany({ where: { correlationId } })),
    ),
  );
  return found.flat().map((event) => event.action);
}

describe('toda ruta que escribe deja su evento de auditoría', () => {
  it('cada ruta que escribe tiene su llamada en este recorrido', () => {
    expect(writeRoutes().sort()).toEqual(Object.keys(WRITE_ROUTE_CALLS).sort());
  });

  it.each(Object.entries(WRITE_ROUTE_CALLS))('%s', async (_route, call) => {
    const correlationId = uuidv7();
    const { test } = await call(scenario);
    const response = await test.set('X-Correlation-Id', correlationId);
    expect(response.status, response.text).toBeLessThan(300);
    expect(await auditedActions(correlationId)).not.toHaveLength(0);
  });
});
