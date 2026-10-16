import { Module } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { VALKEY } from '../../../platform/valkey/valkey.module.js';
import { AttachedFileLinks } from '../application/attached-files.js';
import { FILE_LINKS_BASE_URL, FileLinkIssuer } from '../application/file-link-issuer.js';
import { FilesUseCase } from '../application/files.js';
import { FileLinks } from '../infrastructure/file-links.js';
import { FileStorage, fileStorageFrom } from '../infrastructure/file-storage.js';
import { FileLinksController } from './file-links.controller.js';
import { FilesController } from './files.controller.js';

/**
 * M03 Gestión documental. Desde B14: archivos en el almacenamiento privado, con antivirus,
 * huella SHA-256, lista blanca de tipos y enlaces temporales de subida y descarga. Desde B16
 * entrega a los adjuntos de otros módulos el enlace de descarga (AttachedFileLinks).
 */
@Module({
  controllers: [FilesController, FileLinksController],
  providers: [
    FilesUseCase,
    FileLinkIssuer,
    AttachedFileLinks,
    { provide: FileStorage, useFactory: fileStorageFrom, inject: [CONFIG] },
    { provide: FileLinks, useFactory: (valkey: Redis) => new FileLinks(valkey), inject: [VALKEY] },
    { provide: FILE_LINKS_BASE_URL, useFactory: (config: Env) => config.API_URL, inject: [CONFIG] },
  ],
  exports: [AttachedFileLinks],
})
export class DocModule {}
