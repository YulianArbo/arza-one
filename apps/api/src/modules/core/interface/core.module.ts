import { Module } from '@nestjs/common';

import { AnnouncementsUseCase } from '../application/announcements.js';
import { CalendarUseCase } from '../application/calendar.js';
import { CatalogsUseCase } from '../application/catalogs.js';
import { CostCentersUseCase } from '../application/cost-centers.js';
import { OrgUnitsUseCase } from '../application/org-units.js';
import { ParametersUseCase } from '../application/parameters.js';
import { PositionsUseCase } from '../application/positions.js';
import { PublicAnnouncementsUseCase } from '../application/public-announcements.js';
import { SequencesUseCase } from '../application/sequences.js';
import { TenantAndSitesUseCase } from '../application/tenant-and-sites.js';
import { TenantBrandingUseCase } from '../application/tenant-branding.js';
import { AnnouncementsController } from './announcements.controller.js';
import { BrandingController } from './branding.controller.js';
import { CompanyController } from './company.controller.js';
import { ListsController } from './lists.controller.js';
import { SettingsController } from './settings.controller.js';
import { PositionDirectoryModule } from './position-directory.module.js';
import { TenantGateModule } from './tenant-gate.module.js';
import { PublicAnnouncementsController } from './public-announcements.controller.js';
import { StructureController } from './structure.controller.js';

/**
 * M00 Núcleo (B12): datos legales, sedes, procesos, cargos, centros de costo, catálogos,
 * consecutivos, parámetros con vigencia, festivos y días hábiles; comunicados del acceso (B36A).
 */
@Module({
  imports: [PositionDirectoryModule, TenantGateModule],
  controllers: [
    CompanyController,
    BrandingController,
    StructureController,
    ListsController,
    SettingsController,
    AnnouncementsController,
    PublicAnnouncementsController,
  ],
  providers: [
    TenantAndSitesUseCase,
    TenantBrandingUseCase,
    OrgUnitsUseCase,
    PositionsUseCase,
    CostCentersUseCase,
    CatalogsUseCase,
    ParametersUseCase,
    SequencesUseCase,
    CalendarUseCase,
    AnnouncementsUseCase,
    PublicAnnouncementsUseCase,
  ],
})
export class CoreModule {}
