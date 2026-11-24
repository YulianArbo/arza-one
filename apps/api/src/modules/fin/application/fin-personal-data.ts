import { outcomeFor, shownDate, type PersonalDataSource } from '../../privacy/index.js';

// Lo que Facturación guarda de un titular, para Privacidad (B42, decisión 8): sus facturas. No se
// suprimen: los libros y sus soportes se conservan diez años (Código de Comercio, art. 60), así
// que quedan bloqueadas y la ficha del titular también.

const BOOKS_RETENTION =
  'Facturas: se conservan diez años como soporte contable (Código de Comercio, art. 60).';

export const FIN_PERSONAL_DATA: PersonalDataSource = {
  key: 'fin',
  title: 'Facturación',
  async collect(tx, holder) {
    const invoices = await tx.finInvoice.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    return invoices.map((row) => ({
      title: `Factura ${row.fiscalNumber ?? row.code}`,
      fields: [
        { label: 'Fecha de emisión', value: shownDate(row.issueDate) },
        { label: 'Vence', value: shownDate(row.dueDate) },
        { label: 'Total', value: row.total === null ? null : `$ ${row.total.toFixed(2)}` },
        { label: 'Estado', value: row.status },
      ],
    }));
  },
  async erase(tx, holder) {
    const count = await tx.finInvoice.count({
      where: { partyId: holder.partyId, deletedAt: null },
    });
    return outcomeFor(count, 'blocked', BOOKS_RETENTION);
  },
};
