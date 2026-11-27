import { Module } from '@nestjs/common';

import { DocModule } from '../../doc/index.js';
import { IamModule } from '../../iam/index.js';
import { PlatformTenantsUseCase } from '../application/platform-tenants.js';
import { TenantExportsUseCase } from '../application/tenant-exports.js';
import { PlatformTenantsController } from './platform-tenants.controller.js';
import { TenantExportsController } from './tenant-exports.controller.js';

/**
 * Multiempresa (M00, B48): empresas de la plataforma (alta, plan, suspensión y eliminación) y la
 * exportación completa de cada empresa. El worker genera las exportaciones y ejecuta las
 * eliminaciones vencidas (runTenantExportWork, runTenantPurgeWork).
 */
@Module({
  imports: [DocModule, IamModule],
  controllers: [PlatformTenantsController, TenantExportsController],
  providers: [PlatformTenantsUseCase, TenantExportsUseCase],
})
export class TenancyModule {}
