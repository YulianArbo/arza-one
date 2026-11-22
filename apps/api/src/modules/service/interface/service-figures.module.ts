import { Global, Module } from '@nestjs/common';

import { SERVICE_FIGURES } from '../../qms/index.js';
import { serviceQualityFigures } from '../application/quality-figures.js';

/**
 * Entrega a Calidad el lector de las cifras de Servicio (B39, decisión 6). Es global para que
 * Calidad lo reciba sin importar el módulo de Servicio, que ya depende de Calidad.
 */
@Global()
@Module({
  providers: [{ provide: SERVICE_FIGURES, useValue: serviceQualityFigures }],
  exports: [SERVICE_FIGURES],
})
export class ServiceFiguresModule {}
