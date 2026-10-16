import { Global, Module } from '@nestjs/common';

import { POSITION_DIRECTORY, type PositionDirectory } from '../../iam/index.js';
import { positionRecord } from '../application/positions.js';

const directory: PositionDirectory = { find: positionRecord };

/**
 * Le presta a iam la consulta de cargos para asignar el cargo de cada persona. Es global porque
 * iam no importa el módulo del núcleo.
 */
@Global()
@Module({
  providers: [{ provide: POSITION_DIRECTORY, useValue: directory }],
  exports: [POSITION_DIRECTORY],
})
export class PositionDirectoryModule {}
