import type { Clock } from '../../../platform/clock/clock.js';
import type { DatabaseService } from '../../../platform/database/database.service.js';
import { findLoginUser, linkUserToPerson } from '../../iam/index.js';
import { personByDocument } from '../../party/index.js';

// Quien firma por la empresa necesita su persona en Terceros, con su documento (B25, decisión 3 y
// numeral 19.4). Mientras Talento humano (M12) vincula a los colaboradores, el responsable técnico
// lo hace con `pnpm contratos:vincular-firmante`: la cuenta por su correo y la persona por su
// documento, en la misma empresa. Queda en la auditoría como acción del sistema.

export type SignerLinkOutcome = 'linked' | 'no_account' | 'no_person' | 'not_internal';

export async function linkCompanySigner(
  database: Pick<DatabaseService, 'withTenant' | 'withoutTenant'>,
  clock: Clock,
  input: { readonly email: string; readonly idNumber: string },
): Promise<SignerLinkOutcome> {
  const ref = await findLoginUser(database, input.email);
  if (ref === null) return 'no_account';
  const { tenantId, userId } = ref;
  return database.withTenant({ tenantId, userId: null }, async (tx) => {
    const person = await personByDocument(tx, input.idNumber);
    if (person === null) return 'no_person';
    const link = { tenantId, userId, partyId: person.personId, at: clock.now() };
    return (await linkUserToPerson(tx, link)) ? 'linked' : 'not_internal';
  });
}
