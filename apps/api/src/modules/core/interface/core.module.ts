import { Module } from '@nestjs/common';

import { CalendarUseCase } from '../application/calendar.js';
import { CatalogsUseCase } from '../application/catalogs.js';
import { CostCentersUseCase } from '../application/cost-centers.js';
import { OrgUnitsUseCase } from '../application/org-units.js';
import { ParametersUseCase } from '../application/parameters.js';
import { PositionsUseCase } from '../application/positions.js';
import { SequencesUseCase } from '../application/sequences.js';
import { TenantAndSitesUseCase } from '../application/tenant-and-sites.js';
import { CompanyController } from './company.controller.js';
import { ListsController } from './lists.controller.js';
import { SettingsController } from './settings.controller.js';
import { PositionDirectoryModule } from './position-directory.module.js';
import { StructureController } from './structure.controller.js';

/**
 * M00 Núcleo (B12): datos legales, sedes, procesos, cargos, centros de costo, catálogos,
 * consecutivos, parámetros con vigencia, festivos y días hábiles.
 */
@Module({
  imports: [PositionDirectoryModule],
  controllers: [CompanyController, StructureController, ListsController, SettingsController],
  providers: [
    TenantAndSitesUseCase,
    OrgUnitsUseCase,
    PositionsUseCase,
    CostCentersUseCase,
    CatalogsUseCase,
    ParametersUseCase,
    SequencesUseCase,
    CalendarUseCase,
  ],
})
export class CoreModule {}
