import {
  outcomeFor,
  shownDate,
  shownDateTime,
  type PersonalDataSource,
} from '../../privacy/index.js';

// Lo que Contratos y la firma electrónica guardan de un titular, para Privacidad (B42, decisión 8):
// los contratos de los que es parte o firmante y su evidencia de firma. No se suprimen: el
// contrato se conserva diez años y la evidencia de la firma sostiene la validez del mensaje de
// datos (Ley 527 de 1999), así que quedan bloqueados.

const RETENTION =
  'Contratos y firmas: se conservan diez años (Código de Comercio, art. 60) y la evidencia de firma sostiene su validez (Ley 527 de 1999).';

export const CONTRACT_PERSONAL_DATA: PersonalDataSource = {
  key: 'contract',
  title: 'Contratos y firmas',
  async collect(tx, holder) {
    const contracts = await tx.ctrContract.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    const signatures = await tx.sigSigner.findMany({
      where: { partyId: holder.partyId, deletedAt: null },
      include: { envelope: { select: { code: true, documentTitle: true } } },
      orderBy: { createdAt: 'asc' },
    });
    return [
      ...contracts.map((row) => ({
        title: `Contrato ${row.code}`,
        fields: [
          { label: 'Objeto', value: row.title },
          {
            label: 'Vigencia',
            value: `${shownDate(row.startsOn) ?? ''} a ${shownDate(row.endsOn) ?? ''}`,
          },
          { label: 'Firmante del cliente', value: row.clientSignerName },
          { label: 'Estado', value: row.status },
        ],
      })),
      ...signatures.map((row) => ({
        title: `Firma de ${row.envelope.documentTitle} (${row.envelope.code})`,
        fields: [
          { label: 'Nombre', value: row.name },
          { label: 'Correo', value: row.email },
          { label: 'Documento', value: row.idNumber },
          { label: 'Firmó', value: shownDateTime(row.signedAt) },
          { label: 'Desde la dirección IP', value: row.signIp },
        ],
      })),
    ];
  },
  async erase(tx, holder) {
    const contracts = await tx.ctrContract.count({
      where: { partyId: holder.partyId, deletedAt: null },
    });
    const signatures = await tx.sigSigner.count({
      where: { partyId: holder.partyId, deletedAt: null },
    });
    return outcomeFor(contracts + signatures, 'blocked', RETENTION);
  },
};
