import { Module } from '@nestjs/common';

import { CONFIG } from '../config/config.module.js';
import { readVersionInfo, VERSION_INFO } from './version-info.js';
import { VersionController } from './version.controller.js';

@Module({
  controllers: [VersionController],
  providers: [{ provide: VERSION_INFO, useFactory: readVersionInfo, inject: [CONFIG] }],
})
export class VersionModule {}
