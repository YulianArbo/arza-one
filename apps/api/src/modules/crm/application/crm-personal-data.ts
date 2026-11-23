import type { PersonalDataRecord } from '@arza/contracts';

import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import {
  outcomeFor,
  shownDate,
  shownDateTime,
  type PersonalDataSource,
} from '../../privacy/index.js';

// Lo que Comercial guarda de un titular, para Privacidad (B42, decisión 8): sus prospectos y
// oportunidades, y las cotizaciones que recibió. Al suprimir se borran los textos libres de los
// prospectos y las oportunidades; la ficha del titular la vuelve anónima Terceros. Las cotizaciones
// se conservan: son documentos comerciales con la constancia de lo que se ofreció y se aceptó.

const ERASED_TEXT = 'Datos suprimidos a pedido del titular.';

async function leadRecords(tx: TenantTransaction, partyId: string): Promise<PersonalDataRecord[]> {
  const leads = await tx.crmLead.findMany({
    where: { partyId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return leads.map((row) => ({
    title: `Prospecto ${row.code}`,
    fields: [
      { label: 'Registrado', value: shownDateTime(row.createdAt) },
      { label: 'Empresa', value: row.companyName },
      { label: 'Necesidad', value: row.need },
      { label: 'Estado', value: row.status },
    ],
  }));
}

async function opportunityRecords(
  tx: TenantTransaction,
  partyId: string,
): Promise<PersonalDataRecord[]> {
  const opportunities = await tx.crmOpportunity.findMany({
    where: { partyId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return opportunities.map((row) => ({
    title: `Oportunidad ${row.code}`,
    fields: [
      { label: 'Nombre', value: row.title },
      { label: 'Etapa', value: row.stage },
      { label: 'Cierre esperado', value: shownDate(row.expectedClose) },
    ],
  }));
}

async function quoteRecords(tx: TenantTransaction, partyId: string): Promise<PersonalDataRecord[]> {
  const quotes = await tx.crmQuote.findMany({
    where: { partyId, deletedAt: null },
    orderBy: { createdAt: 'asc' },
  });
  return quotes.map((row) => ({
    title: `Cotización ${row.code}`,
    fields: [
      { label: 'Emitida', value: shownDateTime(row.createdAt) },
      { label: 'Correo de envío', value: row.recipientEmail },
      { label: 'Estado', value: row.status },
    ],
  }));
}

export const CRM_PERSONAL_DATA: PersonalDataSource = {
  key: 'crm',
  title: 'Comercial',
  async collect(tx, holder) {
    return [
      ...(await leadRecords(tx, holder.partyId)),
      ...(await opportunityRecords(tx, holder.partyId)),
      ...(await quoteRecords(tx, holder.partyId)),
    ];
  },
  async erase(tx, holder) {
    const leads = await tx.crmLead.updateMany({
      where: { partyId: holder.partyId, deletedAt: null },
      data: { need: ERASED_TEXT, discardNote: null },
    });
    const opportunities = await tx.crmOpportunity.updateMany({
      where: { partyId: holder.partyId, deletedAt: null },
      data: { lostNote: null },
    });
    const quotes = await tx.crmQuote.count({ where: { partyId: holder.partyId, deletedAt: null } });
    if (quotes > 0) {
      return outcomeFor(
        leads.count + opportunities.count + quotes,
        'kept',
        'Las cotizaciones se conservan como documento comercial con su constancia (Ley 1480 de 2011, art. 50); los textos de prospectos y oportunidades se suprimieron.',
      );
    }
    return outcomeFor(leads.count + opportunities.count, 'erased');
  },
};
