import {
  assetDetailResponseSchema,
  type AssetAssignment,
  assetListResponseSchema,
  type Asset,
  type AssetDetail,
} from '@arza/contracts';
import request from 'supertest';
import { expect } from 'vitest';

import { followLoans, type LoanWorkResult } from '../../../../src/modules/asset/index.js';
import { createdId, keyed, versioned } from '../../fin/support/ledger-steps.js';
import type { Person } from '../../iam/support/access-scenario.js';
import { WEB_ORIGIN, freshIp, tenantScope } from '../../iam/support/iam-fixtures.js';
import { DeliveryScenario } from '../../project/support/delivery-scenario.js';
import { apiDatabase } from '../../support/integration-database.js';

// Escenario de las pruebas del B34 (activos): parte del de entregas, que ya trae la firma
// electrónica, los formatos sembrados (entre ellos el CT-ADM-001) y el worker de prueba de los PDF.
// Agrega quien administra los activos, colaboradores vinculados o no con su persona en Terceros y
// el worker de los comodatos. Datos ficticios.

export const ASSETS = '/v1/assets';
export const ASSIGNMENTS = '/v1/asset-assignments';
export const MAINTENANCE = '/v1/asset-maintenance';

export interface AssetTeam {
  /** Administrativo y financiero: administra, asigna y da de baja. */
  readonly manager: Person;
  /** Colaborador vinculado con su persona en Terceros: puede firmar el comodato. */
  readonly holder: Person;
  /** Colaborador sin persona en Terceros: aún no puede firmar. */
  readonly unlinked: Person;
  readonly auditor: Person;
}

export class AssetScenario extends DeliveryScenario {
  /** Colaborador con su persona en Terceros (con cédula), como lo exige firmar el comodato. */
  async linkedCollaborator(label: string, tenantId = this.tenant.id): Promise<Person> {
    const person = await this.person(label, ['COLABORADOR'], { tenantId });
    const sales = await this.sales(tenantId);
    const body = await this.personWithConsent({ first_name: 'Colaborador' }, tenantId);
    const partyId = await this.party(sales, body);
    await tenantScope(
      this.db,
      tenantId,
    )((tx) => tx.user.update({ where: { id: person.id }, data: { partyId } }));
    return person;
  }

  async assetTeam(label: string): Promise<AssetTeam> {
    return {
      manager: await this.person(`activos-${label}`, ['ADMIN_FINANCIERO']),
      holder: await this.linkedCollaborator(`recibe-${label}`),
      unlinked: await this.person(`sin-vincular-${label}`, ['COLABORADOR']),
      auditor: await this.person(`auditor-${label}`, ['AUDITOR']),
    };
  }

  assetBody(overrides: object = {}): Record<string, unknown> {
    return {
      name: 'Portátil de prueba',
      category: 'computer',
      serial: `SN-${crypto.randomUUID().slice(0, 8)}`,
      purchase_date: this.day(-400),
      cost: '3600000.00',
      useful_life_months: 36,
      location: 'Sede ficticia',
      ...overrides,
    };
  }

  /** Activo disponible (versión 1). */
  async newAsset(manager: Person, overrides: object = {}): Promise<string> {
    return createdId(keyed(this, manager, ASSETS, this.assetBody(overrides)));
  }

  assign(manager: Person, assetId: string, holder: Person): request.Test {
    const body = { user_id: holder.id, assigned_on: this.day(0), message: null };
    return keyed(this, manager, `${ASSETS}/${assetId}/assignments`, body);
  }

  /** Una pasada del worker de comodatos: envía los listos y cierra los respondidos. */
  async loanWork(): Promise<LoanWorkResult> {
    return followLoans({ database: apiDatabase(), clock: this.clock });
  }

  /** Asignado, con el PDF del comodato generado, enviado a firma y el enlace en el correo. */
  async sentToSign(team: AssetTeam, assetId: string): Promise<string> {
    const id = await createdId(this.assign(team.manager, assetId, team.holder));
    await this.renderForms();
    expect((await this.loanWork()).sent).toBeGreaterThanOrEqual(1);
    await this.signatureWork();
    return id;
  }

  /** Asignación vigente: el colaborador firmó y el worker la dejó activa. */
  async signedAssignment(team: AssetTeam, assetId: string): Promise<string> {
    const id = await this.sentToSign(team, assetId);
    await this.clientSigns(team.holder.email);
    expect((await this.loanWork()).answered).toBeGreaterThanOrEqual(1);
    return id;
  }

  /**
   * Asignación vigente dejada lista en la base, sin pasar por la firma: para las pruebas que no
   * tratan de la firma. Otros archivos corren a la vez y comparten el worker de correos de prueba.
   */
  async activeWithoutSigning(team: AssetTeam, assetId: string): Promise<string> {
    const id = await createdId(this.assign(team.manager, assetId, team.holder));
    await tenantScope(
      this.db,
      this.tenant.id,
    )(async (tx) => {
      const data = {
        status: 'active',
        envelopeId: crypto.randomUUID(),
        contractDocumentId: crypto.randomUUID(),
        activatedAt: new Date(),
      };
      await tx.astAssignment.update({ where: { id }, data });
      await tx.astAsset.update({ where: { id: assetId }, data: { status: 'assigned' } });
    });
    return id;
  }

  async assets(person: Person, query = ''): Promise<Asset[]> {
    const response = await this.get(`${ASSETS}${query}`, person.session);
    expect(response.status, response.text).toBe(200);
    return assetListResponseSchema.parse(response.body).data;
  }

  async assetDetail(person: Person, id: string): Promise<AssetDetail> {
    const response = await this.get(`${ASSETS}/${id}`, person.session);
    expect(response.status, response.text).toBe(200);
    return assetDetailResponseSchema.parse(response.body);
  }

  /** La versión vigente de la asignación abierta del activo. */
  async openAssignment(person: Person, assetId: string): Promise<AssetAssignment> {
    const { asset } = await this.assetDetail(person, assetId);
    if (asset.assignment === null) throw new Error('El activo no tiene asignación abierta');
    return asset.assignment;
  }

  async giveBack(manager: Person, assetId: string): Promise<request.Response> {
    const open = await this.openAssignment(manager, assetId);
    const body = { returned_on: this.day(0), note: 'Devuelto en buen estado en la prueba' };
    return versioned(
      this.post(`${ASSIGNMENTS}/${open.id}/return`, manager.session, body),
      open.version,
    );
  }

  async retire(manager: Person, assetId: string): Promise<request.Response> {
    const { asset } = await this.assetDetail(manager, assetId);
    const body = { retired_on: this.day(0), reason: 'obsolescence', note: 'Equipo obsoleto' };
    return versioned(
      this.post(`${ASSETS}/${assetId}/retirement`, manager.session, body),
      asset.version,
    );
  }

  del(path: string, person: Person): request.Test {
    return request(this.app.getHttpServer())
      .delete(path)
      .set('Origin', WEB_ORIGIN)
      .set('X-Forwarded-For', freshIp())
      .set('Cookie', person.session.cookie)
      .set('X-CSRF-Token', person.session.session.csrf_token);
  }
}
