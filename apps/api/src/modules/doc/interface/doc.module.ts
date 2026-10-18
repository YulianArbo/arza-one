import { Module, type OnModuleInit } from '@nestjs/common';
import type { Redis } from 'ioredis';

import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { VALKEY } from '../../../platform/valkey/valkey.module.js';
import { AcknowledgementsUseCase } from '../application/acknowledgements.js';
import { AttachedFileLinks } from '../application/attached-files.js';
import { ChangeRequestsUseCase } from '../application/change-requests.js';
import { followDocWorkflows } from '../application/doc-workflows.js';
import { FILE_LINKS_BASE_URL, FileLinkIssuer } from '../application/file-link-issuer.js';
import { DocumentLinksUseCase } from '../application/document-links.js';
import { DocumentsUseCase } from '../application/documents.js';
import { FilesUseCase } from '../application/files.js';
import { FormRecordsUseCase } from '../application/form-records.js';
import { FormTemplatesUseCase } from '../application/form-templates.js';
import { FoldersUseCase } from '../application/folders.js';
import { MasterListUseCase } from '../application/master-list.js';
import { OutputTemplatesUseCase } from '../application/output-templates.js';
import { VersionActionsUseCase } from '../application/version-actions.js';
import { VersionDownloadsUseCase } from '../application/version-downloads.js';
import { VersionsUseCase } from '../application/versions.js';
import { FileLinks } from '../infrastructure/file-links.js';
import { FileStorage, fileStorageFrom } from '../infrastructure/file-storage.js';
import { AcknowledgementsController } from './acknowledgements.controller.js';
import { ChangeRequestsController } from './change-requests.controller.js';
import { DocumentsController } from './documents.controller.js';
import { FileLinksController } from './file-links.controller.js';
import { FilesController } from './files.controller.js';
import { FoldersController } from './folders.controller.js';
import { FormRecordsController } from './form-records.controller.js';
import { FormTemplatesController } from './form-templates.controller.js';
import { MasterListController } from './master-list.controller.js';
import { OutputTemplatesController } from './output-templates.controller.js';
import { VersionsController } from './versions.controller.js';

/**
 * M03 Gestión documental. Desde B14: archivos en el almacenamiento privado, con antivirus,
 * huella SHA-256, lista blanca de tipos y enlaces temporales de subida y descarga. Desde B16
 * entrega a los adjuntos de otros módulos el enlace de descarga (AttachedFileLinks). Desde B18:
 * carpetas y expedientes, documentos con su código, versiones con su ciclo y su PDF, vínculos con
 * otros registros y el registro de accesos. Los terceros llegan por el puerto DOC_PARTY_LOOKUP.
 * Desde B19: Solicitud de Acción Documental, trámite de las versiones en el motor de flujos (el
 * módulo sigue sus pasos, ADR-023), constancia de lectura y Listado Maestro. Desde B20: formatos
 * digitales con su esquema versionado, registros diligenciados con su aprobación en el motor de
 * flujos y plantillas de salida HTML y Word; el worker genera los PDF.
 */
@Module({
  controllers: [
    FilesController,
    FileLinksController,
    FoldersController,
    DocumentsController,
    VersionsController,
    ChangeRequestsController,
    MasterListController,
    AcknowledgementsController,
    FormTemplatesController,
    FormRecordsController,
    OutputTemplatesController,
  ],
  providers: [
    FilesUseCase,
    FoldersUseCase,
    DocumentsUseCase,
    VersionsUseCase,
    VersionActionsUseCase,
    VersionDownloadsUseCase,
    DocumentLinksUseCase,
    ChangeRequestsUseCase,
    MasterListUseCase,
    AcknowledgementsUseCase,
    FormTemplatesUseCase,
    FormRecordsUseCase,
    OutputTemplatesUseCase,
    FileLinkIssuer,
    AttachedFileLinks,
    { provide: FileStorage, useFactory: fileStorageFrom, inject: [CONFIG] },
    { provide: FileLinks, useFactory: (valkey: Redis) => new FileLinks(valkey), inject: [VALKEY] },
    { provide: FILE_LINKS_BASE_URL, useFactory: (config: Env) => config.API_URL, inject: [CONFIG] },
  ],
  exports: [AttachedFileLinks],
})
export class DocModule implements OnModuleInit {
  onModuleInit(): void {
    followDocWorkflows();
  }
}
