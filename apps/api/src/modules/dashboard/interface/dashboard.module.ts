import { Module } from '@nestjs/common';

import { Dashboards } from '../application/dashboards.js';
import { DashboardsController } from './dashboards.controller.js';

// Tableros de la Dirección (M16, B46). No tiene tablas: lee las cifras que publica cada módulo
// por su index.ts. El normograma y los objetivos estratégicos viven en Calidad (tablas qms_).

@Module({
  controllers: [DashboardsController],
  providers: [Dashboards],
})
export class DashboardModule {}
