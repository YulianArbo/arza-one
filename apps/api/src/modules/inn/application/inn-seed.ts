import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { addDays, bogotaToday, fromCalendarDate } from '../../core/index.js';
import { activeUsersWithRoles } from '../../iam/index.js';
import { seedPublishedFlow } from '../../wf/index.js';
import { IP_FOLLOW_UP_FLOW_DATA } from '../domain/inn-flows.js';
import { innSystemActor, type InnActor } from './inn-support.js';
import { createAsset, type AssetData } from './ip-assets.js';

// Semilla de Innovación (B40): el flujo de seguimiento de la propiedad intelectual en cada empresa
// y, solo en las empresas ficticias, un portafolio de ejemplo para probar las alertas. Los números
// de registro son inventados. Crea lo que falta, así que se puede correr de nuevo.

export async function seedInnovation(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor = innSystemActor(tenantId, clock.now());
    await database.withTenant({ tenantId, userId: null }, (tx) =>
      seedPublishedFlow(tx, actor, IP_FOLLOW_UP_FLOW_DATA),
    );
  }
}

function demoAsset(responsibleId: string, data: Partial<AssetData>): AssetData {
  return {
    kind: 'trademark',
    title: 'Activo de demostración',
    holder: 'Empresa de demostración S.A.S.',
    registryNumber: null,
    niceClasses: null,
    office: 'Superintendencia de Industria y Comercio',
    filedOn: null,
    grantedOn: null,
    expiresOn: null,
    status: 'proposed',
    responsibleId,
    product: null,
    versionLabel: null,
    documentId: null,
    notes: 'Dato ficticio de demostración.',
    ...data,
  };
}

/** Una marca a 150 días de vencer y un dominio a 45: ambos ya en fecha de aviso. */
function demoAssets(responsibleId: string, today: string): AssetData[] {
  const day = (offset: number) => fromCalendarDate(addDays(today, offset));
  return [
    demoAsset(responsibleId, {
      title: 'Marca de demostración (por vencer)',
      registryNumber: 'DEMO-0001',
      niceClasses: '9, 42',
      filedOn: day(-3500),
      expiresOn: day(150),
      status: 'registered',
    }),
    demoAsset(responsibleId, {
      kind: 'software',
      title: 'Plataforma de demostración 1.0',
      office: 'Dirección Nacional de Derecho de Autor',
      product: 'Plataforma de demostración',
      versionLabel: '1.0',
    }),
    demoAsset(responsibleId, {
      kind: 'domain',
      title: 'demostracion.example',
      office: 'Registrador del dominio',
      filedOn: day(-300),
      expiresOn: day(45),
      status: 'registered',
    }),
  ];
}

async function seedDemoTenant(tx: TenantTransaction, actor: InnActor): Promise<void> {
  if ((await tx.innIpAsset.count()) > 0) return;
  const [responsible] = await activeUsersWithRoles(tx, ['CALIDAD', 'DIRECCION'], actor.at);
  if (responsible === undefined) return;
  for (const data of demoAssets(responsible, bogotaToday(actor.at))) {
    await createAsset(tx, actor, data);
  }
}

/** Portafolio de ejemplo para las empresas ficticias. */
export async function seedInnovationDemo(
  database: Pick<DatabaseService, 'withTenant'>,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  for (const tenantId of tenantIds) {
    const actor = innSystemActor(tenantId, clock.now());
    await database.withTenant({ tenantId, userId: null }, (tx) => seedDemoTenant(tx, actor));
  }
}
