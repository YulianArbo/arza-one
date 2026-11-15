import { Module } from '@nestjs/common';

import { AssetsUseCase } from '../application/assets.js';
import { AssignmentsUseCase } from '../application/assignments.js';
import { MaintenanceUseCase } from '../application/maintenance.js';
import { AssetsController } from './assets.controller.js';
import {
  AssetAssignmentsController,
  AssetMaintenanceController,
} from './assignments.controller.js';

/**
 * M11 Activos (B34): inventario de activos fijos y licencias, asignación en comodato con contrato
 * firmado, mantenimientos, bajas y libro de activos. La firma la lleva el módulo de Contratos.
 */
@Module({
  controllers: [AssetsController, AssetAssignmentsController, AssetMaintenanceController],
  providers: [AssetsUseCase, AssignmentsUseCase, MaintenanceUseCase],
})
export class AssetModule {}
