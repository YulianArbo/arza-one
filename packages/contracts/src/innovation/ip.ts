import { z } from 'zod';

import {
  innDateSchema,
  innEnumOf,
  innIdSchema,
  innOptionalText,
  innRefSchema,
  innTextSchema,
} from './common.js';

// Portafolio de propiedad intelectual (B40, ficha 17.16; RE-INN-001, FT-INN-001, FT-INN-002):
// marcas, registros de software y dominios, con titular, número, fechas, vencimiento y la cadena de
// titularidad que enlaza el activo con la cesión de sus autores.

export const IP_KINDS = {
  trademark: 'Marca',
  software: 'Registro de software',
  domain: 'Dominio',
} as const;
export type IpKind = keyof typeof IP_KINDS;
export const ipKindSchema = innEnumOf(IP_KINDS).describe('Tipo de activo');

/** Ante quién se tramita, por tipo de activo. */
export const IP_OFFICES: Readonly<Record<IpKind, string>> = {
  trademark: 'Superintendencia de Industria y Comercio',
  software: 'Dirección Nacional de Derecho de Autor',
  domain: 'Registrador del dominio',
};

export const IP_STATUSES = {
  proposed: 'Propuesto',
  filed: 'Radicado',
  registered: 'Vigente',
  expired: 'Vencido',
  abandoned: 'Abandonado',
} as const;
export type IpStatus = keyof typeof IP_STATUSES;
export const ipStatusSchema = innEnumOf(IP_STATUSES).describe('Estado del activo');

/** Estados que exigen la cadena de titularidad completa en un registro de software (decisión 8). */
export const CHAIN_REQUIRED_STATUSES: readonly IpStatus[] = ['filed', 'registered'];

/** Anticipación de la alerta de renovación (decisión 6): marcas 6 meses, dominios 60 días. */
export const RENEWAL_NOTICE = {
  trademark: { months: 6 },
  domain: { days: 60 },
} as const;

function shiftDate(date: string, months: number, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const lastDay = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay) + days);
  return target.toISOString().slice(0, 10);
}

/** Desde qué día se avisa la renovación; null si el activo no vence o no se avisa. */
export function renewalAlertOn(kind: IpKind, expiresOn: string | null): string | null {
  if (expiresOn === null) return null;
  if (kind === 'trademark') return shiftDate(expiresOn, -RENEWAL_NOTICE.trademark.months, 0);
  if (kind === 'domain') return shiftDate(expiresOn, 0, -RENEWAL_NOTICE.domain.days);
  return null;
}

export const AUTHOR_SUPPORTS = {
  employment_contract: 'Contrato laboral firmado (Talento humano)',
  contract: 'Contrato del módulo de Contratos',
  document: 'Documento de cesión firmado',
} as const;
export type AuthorSupport = keyof typeof AUTHOR_SUPPORTS;
export const authorSupportSchema = innEnumOf(AUTHOR_SUPPORTS).describe('Soporte de la cesión');

export const ipAuthorSchema = z.object({
  id: innIdSchema,
  name: z.string(),
  user_id: innIdSchema.nullable(),
  contribution: z.string().nullable(),
  support_kind: authorSupportSchema,
  support_label: z.string().describe('Contrato o archivo que soporta la cesión'),
});

const ipAssetBase = {
  id: innIdSchema,
  code: z.string(),
  kind: ipKindSchema,
  title: z.string(),
  holder: z.string(),
  registry_number: z.string().nullable(),
  nice_classes: z.string().nullable(),
  office: z.string(),
  filed_on: innDateSchema.nullable(),
  granted_on: innDateSchema.nullable(),
  expires_on: innDateSchema.nullable(),
  status: ipStatusSchema,
  responsible: innRefSchema,
  product: z.string().nullable(),
  version_label: z.string().nullable(),
  certificate: z.object({ id: innIdSchema, file_name: z.string() }).nullable(),
  notes: z.string().nullable(),
  renewal_due: z.boolean().describe('Ya llegó la fecha de aviso de renovación'),
  days_to_expiry: z.number().int().nullable(),
  authors_count: z.number().int(),
  chain_complete: z.boolean().describe('Todos los autores tienen soporte de cesión'),
  version: z.number().int().positive(),
};

export const ipAssetSchema = z.object(ipAssetBase);
export const ipAssetDetailSchema = z.object({
  ...ipAssetBase,
  authors: z.array(ipAuthorSchema),
});
export const ipAssetListResponseSchema = z.object({ data: z.array(ipAssetSchema) });

export const saveIpAssetSchema = z
  .strictObject({
    kind: ipKindSchema,
    title: innTextSchema(2, 160).describe('Nombre de la marca, del software o del dominio'),
    holder: innTextSchema(2, 160).describe('Titular del derecho'),
    registry_number: innOptionalText(80),
    nice_classes: innOptionalText(80),
    office: innOptionalText(120),
    filed_on: innDateSchema.nullable().default(null),
    granted_on: innDateSchema.nullable().default(null),
    expires_on: innDateSchema.nullable().default(null),
    status: ipStatusSchema.default('proposed'),
    responsible_id: innIdSchema.describe('Cuenta de quien responde por el activo'),
    product: innOptionalText(80),
    version_label: innOptionalText(40),
    certificate_file_id: innIdSchema.nullable().default(null).describe('Certificado en PDF'),
    notes: innOptionalText(2000),
  })
  .refine((input) => input.kind !== 'software' || input.expires_on === null, {
    path: ['expires_on'],
    message: 'El registro de software no vence: deje el vencimiento vacío.',
  })
  .refine((input) => input.kind === 'trademark' || input.nice_classes === null, {
    path: ['nice_classes'],
    message: 'Las clases de Niza solo aplican a las marcas.',
  })
  .refine(
    (input) =>
      input.status !== 'registered' || input.kind === 'software' || input.expires_on !== null,
    { path: ['expires_on'], message: 'Escriba la fecha de vencimiento del activo vigente.' },
  )
  .refine(
    (input) =>
      input.status !== 'registered' || input.kind === 'domain' || input.registry_number !== null,
    { path: ['registry_number'], message: 'Escriba el número de registro del activo vigente.' },
  )
  .refine((input) => input.status === 'proposed' || input.filed_on !== null, {
    path: ['filed_on'],
    message: 'Escriba la fecha de radicación.',
  })
  .refine(
    (input) =>
      input.filed_on === null || input.expires_on === null || input.expires_on > input.filed_on,
    { path: ['expires_on'], message: 'El vencimiento debe ser posterior a la radicación.' },
  );

export const addIpAuthorSchema = z
  .strictObject({
    user_id: innIdSchema.nullable().default(null).describe('Cuenta del autor, si es de la empresa'),
    name: innOptionalText(160).describe('Nombre del autor externo'),
    contribution: innOptionalText(500),
    support_kind: authorSupportSchema,
    contract_code: innOptionalText(40).describe('Código del contrato de cesión en Contratos'),
    support_file_id: innIdSchema.nullable().default(null).describe('Cesión firmada en PDF'),
  })
  .refine((input) => (input.user_id === null) !== (input.name === null), {
    path: ['name'],
    message: 'Elija una persona de la empresa o escriba el nombre del autor externo.',
  })
  .refine((input) => input.support_kind !== 'employment_contract' || input.user_id !== null, {
    path: ['support_kind'],
    message: 'El contrato laboral solo aplica a personas de la empresa.',
  })
  .refine((input) => (input.support_kind === 'contract') === (input.contract_code !== null), {
    path: ['contract_code'],
    message: 'Escriba el código del contrato de cesión.',
  })
  .refine((input) => (input.support_kind === 'document') === (input.support_file_id !== null), {
    path: ['support_file_id'],
    message: 'Adjunte el documento de cesión firmado.',
  });

export type IpAsset = z.infer<typeof ipAssetSchema>;
export type IpAssetDetail = z.infer<typeof ipAssetDetailSchema>;
export type IpAuthor = z.infer<typeof ipAuthorSchema>;
export type SaveIpAsset = z.infer<typeof saveIpAssetSchema>;
export type AddIpAuthor = z.infer<typeof addIpAuthorSchema>;
