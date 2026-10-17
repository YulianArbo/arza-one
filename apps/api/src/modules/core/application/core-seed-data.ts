import type { WorkSchedule } from '@arza/contracts';

// Datos semilla del núcleo (B12, capítulo 12.1).
//
// ORGANIGRAMA PROVISIONAL: el documento DC-SGC-001 no está en el repositorio. Esta estructura se
// armó con los cargos que nombran los capítulos 3 y 15.2 del manual y debe confirmarla el
// Director General; se corrige desde Administración › Procesos y cargos.

export const HOLIDAY_YEARS = [2025, 2026, 2027, 2028, 2029, 2030];

/** Lunes a viernes, 8:00 a 12:00 y 13:00 a 17:00: 40 horas (ficha 17.1). */
export const WORK_SCHEDULE: WorkSchedule = {
  days: [1, 2, 3, 4, 5],
  morning: { start: '08:00', end: '12:00' },
  afternoon: { start: '13:00', end: '17:00' },
};

export const WORK_SCHEDULE_VALID_FROM = '2026-01-01';

export interface SeedCatalog {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly items: readonly (readonly [code: string, label: string])[];
}

export const CATALOGS: readonly SeedCatalog[] = [
  {
    key: 'identification_types',
    name: 'Tipos de documento de identidad',
    description: 'Documentos con que se identifica una persona o una organización.',
    items: [
      ['CC', 'Cédula de ciudadanía'],
      ['CE', 'Cédula de extranjería'],
      ['NIT', 'Número de identificación tributaria'],
      ['PA', 'Pasaporte'],
      ['TI', 'Tarjeta de identidad'],
      ['PPT', 'Permiso por protección temporal'],
    ],
  },
  {
    key: 'banks',
    name: 'Bancos',
    description: 'Entidades donde los terceros tienen sus cuentas para pagos (B13).',
    items: [
      ['BANCOLOMBIA', 'Bancolombia'],
      ['BOGOTA', 'Banco de Bogotá'],
      ['DAVIVIENDA', 'Davivienda'],
      ['BBVA', 'BBVA Colombia'],
      ['OCCIDENTE', 'Banco de Occidente'],
      ['POPULAR', 'Banco Popular'],
      ['AV_VILLAS', 'Banco AV Villas'],
      ['COLPATRIA', 'Scotiabank Colpatria'],
      ['CAJA_SOCIAL', 'Banco Caja Social'],
      ['AGRARIO', 'Banco Agrario de Colombia'],
      ['ITAU', 'Itaú'],
      ['GNB_SUDAMERIS', 'Banco GNB Sudameris'],
      ['FALABELLA', 'Banco Falabella'],
      ['PICHINCHA', 'Banco Pichincha'],
      ['BANCOOMEVA', 'Bancoomeva'],
      ['NU', 'Nu Colombia'],
      ['LULO', 'Lulo Bank'],
    ],
  },
  {
    key: 'personal_data_purposes',
    name: 'Finalidades del tratamiento',
    description:
      'Para qué se usan los datos personales de un tercero (Ley 1581 de 2012). Las precisa el módulo de privacidad.',
    items: [
      ['COMMERCIAL', 'Relación comercial y contractual'],
      ['BILLING', 'Facturación, pagos y cartera'],
      ['SUPPORT', 'Servicio al cliente y soporte'],
      ['SUPPLIER', 'Gestión de proveedores'],
      ['EMPLOYMENT', 'Relación laboral'],
      ['RECRUITMENT', 'Selección de personal'],
      ['MARKETING', 'Envío de información comercial'],
    ],
  },
  {
    key: 'document_types',
    name: 'Tipos de documento',
    description:
      'Primera parte del código de un documento del SGC (PR-SGC-001): TIPO-PROCESO-NNN. La usa la gestión documental.',
    items: [
      ['MN', 'Manual'],
      ['PR', 'Procedimiento'],
      ['PL', 'Plan'],
      ['PT', 'Protocolo'],
      ['IN', 'Instructivo'],
      ['MP', 'Mapa'],
      ['DC', 'Documento descriptivo'],
      ['PVE', 'Programa de vigilancia epidemiológica'],
      ['FT', 'Formato'],
      ['RE', 'Registro'],
      ['CT', 'Contrato'],
      ['OS', 'Orden de servicio'],
      ['AN', 'Anexo'],
    ],
  },
];

/** Procesos del mapa de procesos, con el código que usan los módulos (capítulo 7.4). */
export const PROCESSES: readonly (readonly [code: string, name: string])[] = [
  ['DG', 'Dirección General'],
  ['SGC', 'Gestión de la Calidad'],
  ['INN', 'Innovación'],
  ['COM', 'Gestión Comercial'],
  ['TEC', 'Desarrollo y Tecnología'],
  ['SAC', 'Servicio al Cliente'],
  ['FIN', 'Gestión Financiera'],
  ['ADM', 'Gestión Administrativa'],
  ['GTH', 'Gestión del Talento Humano'],
  ['SST', 'Seguridad y Salud en el Trabajo'],
];

export interface SeedPosition {
  readonly name: string;
  readonly process: string;
  readonly reportsTo: string | null;
  /** Procesos que lidera. */
  readonly leads: readonly string[];
}

/** En orden: cada cargo aparece después del cargo al que reporta. */
export const POSITIONS: readonly SeedPosition[] = [
  { name: 'Director General', process: 'DG', reportsTo: null, leads: ['DG'] },
  {
    name: 'Coordinador de Calidad e Innovación',
    process: 'SGC',
    reportsTo: 'Director General',
    leads: ['SGC', 'INN'],
  },
  {
    name: 'Oficial de Protección de Datos Personales',
    process: 'DG',
    reportsTo: 'Director General',
    leads: [],
  },
  { name: 'Gerente Comercial', process: 'COM', reportsTo: 'Director General', leads: ['COM'] },
  { name: 'Analista Comercial', process: 'COM', reportsTo: 'Gerente Comercial', leads: [] },
  {
    name: 'Gerente de Desarrollo y Tecnología',
    process: 'TEC',
    reportsTo: 'Director General',
    leads: ['TEC'],
  },
  {
    name: 'Líder Técnico',
    process: 'TEC',
    reportsTo: 'Gerente de Desarrollo y Tecnología',
    leads: [],
  },
  { name: 'Desarrollador', process: 'TEC', reportsTo: 'Líder Técnico', leads: [] },
  {
    name: 'Líder de Servicio al Cliente',
    process: 'SAC',
    reportsTo: 'Director General',
    leads: ['SAC'],
  },
  {
    name: 'Técnico de Servicio al Cliente',
    process: 'SAC',
    reportsTo: 'Líder de Servicio al Cliente',
    leads: [],
  },
  {
    name: 'Gerente Administrativo y Financiero',
    process: 'ADM',
    reportsTo: 'Director General',
    leads: ['ADM', 'FIN'],
  },
  {
    name: 'Asistente Administrativo',
    process: 'ADM',
    reportsTo: 'Gerente Administrativo y Financiero',
    leads: [],
  },
  {
    name: 'Coordinador de Talento Humano',
    process: 'GTH',
    reportsTo: 'Gerente Administrativo y Financiero',
    leads: ['GTH'],
  },
  {
    name: 'Líder de Seguridad y Salud en el Trabajo',
    process: 'SST',
    reportsTo: 'Coordinador de Talento Humano',
    leads: ['SST'],
  },
];
