import { Inject, Injectable } from '@nestjs/common';
import { IMAGE_TYPES, type ImageUploadRequest, type UploadLinkResponse } from '@arza/contracts';

import type { OwnImageState, ProfileImages, StoredImage } from '../../iam/index.js';
import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';
import { FileStorage } from '../infrastructure/file-storage.js';
import { FilesUseCase } from './files.js';

// Fotos de perfil y logos (B22A) sobre los archivos de la gestión documental: la misma carga en
// dos pasos, el mismo antivirus y la misma auditoría. Quien la usa ya revisó el permiso.

const AVAILABLE_IMAGE = {
  scanStatus: 'available',
  deletedAt: null,
  mimeType: { in: [...IMAGE_TYPES] },
};

/** Recién subida o en el antivirus: la web espera unos segundos y vuelve a intentar. */
const SCANNING = new Set(['pending_upload', 'scanning']);

@Injectable()
export class DocProfileImages implements ProfileImages {
  constructor(
    @Inject(FilesUseCase) private readonly files: FilesUseCase,
    @Inject(FileStorage) private readonly storage: FileStorage,
  ) {}

  requestUpload(
    principal: Principal,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse> {
    return this.files.requestUpload(principal, input, meta);
  }

  async ownImageState(
    tx: TenantTransaction,
    principal: Principal,
    fileId: string,
  ): Promise<OwnImageState> {
    const file = await tx.file.findFirst({
      where: {
        id: fileId,
        createdBy: principal.userId,
        deletedAt: null,
        mimeType: { in: [...IMAGE_TYPES] },
      },
    });
    if (file === null) return 'invalid';
    if (file.scanStatus === 'available') return 'available';
    return SCANNING.has(file.scanStatus) ? 'scanning' : 'invalid';
  }

  async open(tx: TenantTransaction, fileId: string): Promise<StoredImage | null> {
    const file = await tx.file.findFirst({ where: { id: fileId, ...AVAILABLE_IMAGE } });
    if (file === null) return null;
    const content = await this.storage.stream(file.storageKey);
    return { mimeType: file.mimeType, sizeBytes: file.sizeBytes, content };
  }
}
