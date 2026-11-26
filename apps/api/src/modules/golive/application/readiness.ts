import type { LegalTextKey } from '@arza/contracts';
import { LEGAL_TEXT_KINDS } from '@arza/contracts';

import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { tenantRegistered } from '../../core/index.js';
import { documentFigures } from '../../doc/index.js';
import { accountFindings } from '../../iam/index.js';
import { legalTextsWithoutConcept } from '../../web/index.js';

// Revisión de puesta en marcha (B45, decisión 10): solo lee. Responde «cumple» o «no cumple» en los
// puntos del anexo E que la plataforma puede comprobar sola; los demás (revisión externa, prueba de
// intrusión, correo, capacitación, acta) se verifican con su evidencia en docs/puesta-en-marcha.

export interface ReadinessCheck {
  /** Punto del anexo E que respalda. */
  readonly item: number;
  readonly title: string;
  readonly ok: boolean;
  readonly detail: string;
}

export interface ReadinessRequest {
  readonly tenantId: string;
  /** Empresas ficticias que no deben existir en producción. */
  readonly demoTenantIds: readonly string[];
}

type Reader = Pick<DatabaseService, 'withTenant'>;

function inTenant<T>(
  database: Reader,
  tenantId: string,
  work: (tx: TenantTransaction) => Promise<T>,
) {
  return database.withTenant({ tenantId, userId: null }, work);
}

async function demoCheck(database: Reader, ids: readonly string[]): Promise<ReadinessCheck> {
  let found = 0;
  for (const id of ids)
    if (await inTenant(database, id, (tx) => tenantRegistered(tx, id))) found += 1;
  return {
    item: 22,
    title: 'Sin empresas de demostración',
    ok: found === 0,
    detail:
      found === 0
        ? 'No hay empresas ficticias.'
        : `Hay ${String(found)} empresas ficticias: no se cargó la semilla de producción.`,
  };
}

function legalCheck(missing: readonly LegalTextKey[]): ReadinessCheck {
  const names = missing.map((key) => LEGAL_TEXT_KINDS[key].label).join(', ');
  return {
    item: 12,
    title: 'Textos legales publicados con concepto jurídico',
    ok: missing.length === 0,
    detail:
      missing.length === 0
        ? 'Términos del sitio, de la plataforma y política de cookies publicados con su concepto.'
        : `Faltan publicar con el concepto del asesor: ${names}.`,
  };
}

async function tenantChecks(tx: TenantTransaction): Promise<ReadinessCheck[]> {
  const accounts = await accountFindings(tx);
  const documents = await documentFigures(tx);
  return [
    {
      item: 22,
      title: 'Sin cuentas de prueba',
      ok: accounts.testAccounts === 0,
      detail: `${String(accounts.testAccounts)} cuentas con correo de un dominio de pruebas (.test, .example, .invalid, .localhost).`,
    },
    {
      item: 17,
      title: 'Usuarios internos con segundo factor',
      ok: accounts.activeInternal > 0 && accounts.withoutSecondFactor === 0,
      detail: `${String(accounts.activeInternal)} cuentas internas activas; ${String(accounts.withoutSecondFactor)} sin segundo factor.`,
    },
    {
      item: 16,
      title: 'Listado Maestro cargado',
      ok: documents.currentControlled > 0,
      detail: `${String(documents.currentControlled)} documentos del SGC vigentes. Compare con el informe de importación.`,
    },
    {
      item: 16,
      title: 'Todo documento con regla de retención',
      ok: documents.withoutRetention === 0,
      detail: `${String(documents.withoutRetention)} documentos sin regla de retención (numeral 18.2, paso 4).`,
    },
    legalCheck(await legalTextsWithoutConcept(tx)),
  ];
}

/** Corre la revisión en la empresa indicada, sin escribir nada. */
export async function reviewReadiness(
  database: Reader,
  request: ReadinessRequest,
): Promise<ReadinessCheck[]> {
  const demo = await demoCheck(database, request.demoTenantIds);
  const own = await inTenant(database, request.tenantId, tenantChecks);
  return [demo, ...own];
}
