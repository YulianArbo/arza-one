import type { Readable } from 'node:stream';

import type { ImageUploadRequest, UploadLinkResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import type { RequestMeta } from '../../../platform/http/request-meta.js';

// Puertos de la foto de perfil y de la empresa cliente (B22A). La gestión documental ya depende de
// identidad y terceros también; para no cerrar el círculo, identidad pide aquí lo que necesita y
// esos módulos lo implementan (como POSITION_DIRECTORY y DOC_PARTY_LOOKUP).

/** Contenido de una imagen guardada, para entregarlo a la web. */
export interface StoredImage {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content: Readable;
}

/** Imágenes guardadas en los archivos de la gestión documental, con su antivirus. */
export interface ProfileImages {
  /** Enlace para subir una imagen; queda en la auditoría como cualquier archivo. */
  requestUpload(
    principal: Principal,
    input: ImageUploadRequest,
    meta: RequestMeta,
  ): Promise<UploadLinkResponse>;
  /**
   * Estado de una imagen PNG o JPG que subió la persona: lista, todavía en el antivirus, o que no
   * sirve (no existe, es de otra persona o de otra empresa, no es imagen o fue rechazada).
   */
  ownImageState(
    tx: TenantTransaction,
    principal: Principal,
    fileId: string,
  ): Promise<OwnImageState>;
  /** El contenido de una imagen disponible, o null si ya no lo está. */
  open(tx: TenantTransaction, fileId: string): Promise<StoredImage | null>;
}

export type OwnImageState = 'available' | 'scanning' | 'invalid';

export const PROFILE_IMAGES = Symbol('PROFILE_IMAGES');

/** Un tercero, como lo necesita el portal para mostrar la empresa de la persona. */
export interface ClientCompany {
  readonly id: string;
  readonly name: string;
  readonly logoFileId: string | null;
  /** Organización vigente con el papel de cliente activo: se puede ligar a una cuenta del portal. */
  readonly isClient: boolean;
}

export interface ClientCompanies {
  describe(tx: TenantTransaction, partyId: string): Promise<ClientCompany | null>;
}

export const CLIENT_COMPANIES = Symbol('CLIENT_COMPANIES');
