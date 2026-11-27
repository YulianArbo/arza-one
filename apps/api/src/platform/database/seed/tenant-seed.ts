// Lo que toda empresa necesita para empezar (B48): roles y permisos, catálogos y parámetros del
// núcleo, carpetas, flujos y formularios de documentos, plantillas de avisos, textos de privacidad,
// parámetros tributarios, flujos del CRM, biblioteca de contratos, flujo de proyectos, servicio,
// innovación y textos del sitio. Lo usan `pnpm db:seed` y el alta de una empresa nueva. Cada
// semilla crea lo que falta y no toca lo demás.
import { seedContracts } from '../../../modules/contract/index.js';
import { seedCore } from '../../../modules/core/index.js';
import { seedCrmWorkflows } from '../../../modules/crm/index.js';
import { seedDocFolders, seedDocForms, seedDocWorkflows } from '../../../modules/doc/index.js';
import { seedTaxParameters } from '../../../modules/fin/index.js';
import { seedInnovation } from '../../../modules/inn/index.js';
import { seedAccessControl } from '../../../modules/iam/index.js';
import { seedNotificationTemplates } from '../../../modules/ntf/index.js';
import { seedPrivacyNotices } from '../../../modules/privacy/index.js';
import { seedProjects } from '../../../modules/project/index.js';
import { seedService } from '../../../modules/service/index.js';
import { seedSiteTexts } from '../../../modules/web/index.js';
import type { Clock } from '../../clock/clock.js';
import type { DatabaseService } from '../database.service.js';

export async function seedTenantBasics(
  database: DatabaseService,
  tenantIds: readonly string[],
  clock: Clock,
): Promise<void> {
  await seedAccessControl(database, tenantIds, clock);
  await seedCore(database, tenantIds, clock);
  await seedDocFolders(database, tenantIds, clock);
  await seedDocWorkflows(database, tenantIds, clock);
  await seedDocForms(database, tenantIds, clock);
  await seedNotificationTemplates(database, tenantIds, clock);
  await seedPrivacyNotices(database, tenantIds, clock);
  await seedTaxParameters(database, tenantIds, clock);
  await seedCrmWorkflows(database, tenantIds, clock);
  await seedContracts(database, tenantIds, clock);
  await seedProjects(database, tenantIds, clock);
  await seedService(database, tenantIds, clock);
  await seedInnovation(database, tenantIds, clock);
  await seedSiteTexts(database, tenantIds, clock);
}
