import type { TenantTransaction } from '../../../platform/database/tenant-context.js';
import { accountsWithRoles, type CompanySignerAccount } from '../../iam/index.js';
import { signingPerson } from '../../party/index.js';
import { signersInvalid } from './signature-messages.js';

/** Rol que firma por la empresa (numeral 15.2: la Dirección firma los contratos). */
const COMPANY_SIGNER_ROLE = 'DIRECCION';

/** Persona propuesta como firmante, con los datos que exige la preparación del envío. */
export interface SignerCandidate {
  readonly personId: string | null;
  readonly name: string;
  readonly email: string | null;
  readonly document: string | null;
}

/** Cuenta de Dirección con su persona en Terceros ya resuelta. */
export interface CompanyCandidate extends SignerCandidate {
  readonly userId: string;
}

/** Firmante de empresa listo: correo y documento verificados. */
export interface CompanySigner extends CompanyCandidate {
  readonly email: string;
  readonly document: string;
}

async function companyCandidate(
  tx: TenantTransaction,
  account: CompanySignerAccount,
): Promise<CompanyCandidate> {
  const person = account.partyId === null ? null : await signingPerson(tx, account.partyId);
  return {
    userId: account.id,
    personId: person?.personId ?? null,
    name: person?.name ?? account.displayName ?? account.email,
    email: account.email,
    document: person?.document ?? null,
  };
}

/** La Dirección con su persona en Terceros: de ahí salen su nombre, su documento y su correo. */
export async function companyCandidates(
  tx: TenantTransaction,
  at: Date,
): Promise<CompanyCandidate[]> {
  const accounts = await accountsWithRoles(tx, [COMPANY_SIGNER_ROLE], at);
  const candidates: CompanyCandidate[] = [];
  for (const account of accounts) {
    candidates.push(await companyCandidate(tx, account));
  }
  return candidates;
}

/** Opciones de firma por la empresa que se ofrecen al preparar el envío. */
export async function employmentCompanySigners(
  tx: TenantTransaction,
  at: Date,
): Promise<{ readonly id: string; readonly name: string; readonly ready: boolean }[]> {
  return (await companyCandidates(tx, at)).map((candidate) => ({
    id: candidate.userId,
    name: candidate.name,
    ready: candidate.email !== null && candidate.document !== null,
  }));
}

/** La persona de Dirección que firma por la empresa, con correo y documento verificados. */
export async function companySigner(
  tx: TenantTransaction,
  userId: string,
  at: Date,
): Promise<CompanySigner> {
  const candidate = (await companyCandidates(tx, at)).find((option) => option.userId === userId);
  if (candidate === undefined) {
    throw signersInvalid('Por la empresa firma una persona activa con el rol Dirección.');
  }
  if (candidate.email === null || candidate.document === null) {
    throw signersInvalid(
      `Vincule a ${candidate.name} con su persona en Terceros, con su documento, antes de que firme por la empresa.`,
    );
  }
  return { ...candidate, email: candidate.email, document: candidate.document };
}
