import { Inject, Injectable } from '@nestjs/common';
import type { MyCompanyResponse } from '@arza/contracts';

import type { Principal } from '../../../platform/access/principal.js';
import { DatabaseService } from '../../../platform/database/database.service.js';
import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { imageNotFound } from './image-messages.js';
import {
  CLIENT_COMPANIES,
  PROFILE_IMAGES,
  type ClientCompanies,
  type ClientCompany,
  type ProfileImages,
  type StoredImage,
} from './profile-ports.js';

/**
 * Empresa cliente de la persona del portal (B22A): la que eligió el administrador al invitarla.
 * Su nombre y su logo salen arriba a la derecha del portal; nadie ve la empresa de otra cuenta.
 */
@Injectable()
export class MyCompanyQuery {
  constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
    @Inject(CLIENT_COMPANIES) private readonly companies: ClientCompanies,
    @Inject(PROFILE_IMAGES) private readonly images: ProfileImages,
  ) {}

  async company(principal: Principal): Promise<MyCompanyResponse> {
    const company = await this.database.withTenant(principal, (tx) => this.find(tx, principal));
    if (company === null) return { company: null };
    return {
      company: { id: company.id, name: company.name, has_logo: company.logoFileId !== null },
    };
  }

  async logo(principal: Principal): Promise<StoredImage> {
    return this.database.withTenant(principal, async (tx) => {
      const logoFileId = (await this.find(tx, principal))?.logoFileId ?? null;
      const image = logoFileId === null ? null : await this.images.open(tx, logoFileId);
      if (image === null) throw imageNotFound();
      return image;
    });
  }

  private async find(tx: TenantTransaction, principal: Principal): Promise<ClientCompany | null> {
    const user = await tx.user.findUniqueOrThrow({ where: { id: principal.userId } });
    if (user.kind !== 'portal' || user.partyId === null) return null;
    return this.companies.describe(tx, user.partyId);
  }
}
