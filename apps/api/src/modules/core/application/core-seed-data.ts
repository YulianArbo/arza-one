import type { DiscountCap, PurchaseTiers, WorkSchedule } from '@arza/contracts';

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

/** Tope de descuento sin aprobación de la Dirección (B23): 10 % por ítem, decisión del dueño. */
export const DISCOUNT_CAP: DiscountCap = { percent: '10.00' };

/**
 * Topes de aprobación de compras (B33, decisión 2): valores DE EJEMPLO, pendientes de validar
 * contra PR-ADM-001. Hasta $ 1.000.000, una cotización; hasta $ 10.000.000, dos; por encima, tres
 * y aprueba la Dirección. Se corrigen desde Administración › Parámetros.
 */
export const PURCHASE_APPROVAL_TIERS: PurchaseTiers = {
  low_limit: '1000000.00',
  mid_limit: '10000000.00',
  quotes_low: 1,
  quotes_mid: 2,
  quotes_high: 3,
};

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
      ['RIT', 'Reglamento Interno de Trabajo'],
    ],
  },
  {
    key: 'hr_salary_bands',
    name: 'Bandas salariales',
    description:
      'Bandas del salario de los colaboradores (ficha 17.13, B35). El valor exacto solo lo ven Talento humano, la Dirección y el Contador. Valores de ejemplo por ajustar.',
    items: [
      ['BANDA_1', 'Banda 1'],
      ['BANDA_2', 'Banda 2'],
      ['BANDA_3', 'Banda 3'],
      ['BANDA_4', 'Banda 4'],
      ['BANDA_5', 'Banda 5'],
    ],
  },
  {
    key: 'hr_leave_types',
    name: 'Tipos de ausencia',
    description:
      'Permisos, licencias, vacaciones e incapacidades (ficha 17.13, B36). Las vacaciones descuentan del saldo; la incapacidad la registra solo Talento humano, sin diagnóstico. Valores de ejemplo por validar.',
    items: [
      ['VACACIONES', 'Vacaciones'],
      ['PERMISO_REMUNERADO', 'Permiso remunerado'],
      ['PERMISO_NO_REMUNERADO', 'Permiso no remunerado'],
      ['LUTO', 'Licencia por luto'],
      ['CALAMIDAD', 'Licencia por calamidad doméstica'],
      ['MATERNIDAD', 'Licencia de maternidad'],
      ['PATERNIDAD', 'Licencia de paternidad'],
      ['INCAPACIDAD', 'Incapacidad'],
    ],
  },
  {
    key: 'hr_novelty_concepts',
    name: 'Conceptos de novedades de nómina',
    description:
      'Conceptos del archivo de novedades para el software de nómina (ficha 17.13, B36). Por validar contra la matriz RE-GTH-003; los conceptos que la plataforma genera sola no se deben retirar.',
    items: [
      ['VACACIONES', 'Vacaciones disfrutadas'],
      ['LICENCIA_REMUNERADA', 'Licencia o permiso remunerado'],
      ['LICENCIA_NO_REMUNERADA', 'Licencia o permiso no remunerado'],
      ['INCAPACIDAD', 'Incapacidad'],
      ['HE_DIURNA', 'Hora extra diurna'],
      ['HE_NOCTURNA', 'Hora extra nocturna'],
      ['HE_DOMINICAL_DIURNA', 'Hora extra dominical o festiva diurna'],
      ['HE_DOMINICAL_NOCTURNA', 'Hora extra dominical o festiva nocturna'],
      ['RETIRO', 'Retiro del colaborador'],
      ['INGRESO', 'Ingreso del colaborador'],
      ['BONIFICACION', 'Bonificación'],
      ['AUXILIO', 'Auxilio'],
      ['DESCUENTO', 'Descuento autorizado'],
      ['OTRO', 'Otra novedad'],
    ],
  },
  {
    key: 'crm_lead_sources',
    name: 'Orígenes de los prospectos',
    description: 'Por dónde llegó un prospecto al CRM (B22). Se usan en el informe del embudo.',
    items: [
      ['WEBSITE', 'Sitio web'],
      ['REFERRAL', 'Referido'],
      ['EVENT', 'Evento o feria'],
      ['SOCIAL', 'Redes sociales'],
      ['INBOUND_CALL', 'Llamada entrante'],
      ['EMAIL', 'Correo'],
      ['OTHER', 'Otro'],
    ],
  },
  {
    key: 'crm_lost_reasons',
    name: 'Motivos de pérdida',
    description: 'Por qué se perdió una oportunidad (ficha 17.6: perderla exige el motivo).',
    items: [
      ['PRICE', 'Precio'],
      ['COMPETITOR', 'Eligió otro proveedor'],
      ['NO_BUDGET', 'Sin presupuesto'],
      ['NO_RESPONSE', 'Sin respuesta'],
      ['CANCELLED', 'Proyecto cancelado'],
      ['OTHER', 'Otro'],
    ],
  },
  {
    key: 'crm_discard_reasons',
    name: 'Motivos de descarte',
    description: 'Por qué se descartó un prospecto sin convertirlo en oportunidad (B22).',
    items: [
      ['NOT_TARGET', 'No es cliente objetivo'],
      ['FALSE_DATA', 'Datos falsos'],
      ['DUPLICATE', 'Duplicado'],
      ['OTHER', 'Otro'],
    ],
  },
  {
    key: 'fin_expense_categories',
    name: 'Rubros de gasto y presupuesto',
    description:
      'Rubros con que se planea el presupuesto y se clasifican gastos y vales de caja menor (B32).',
    items: [
      ['SOFTWARE', 'Software y licencias'],
      ['PRO_SERVICES', 'Servicios profesionales'],
      ['TRANSPORT', 'Transporte'],
      ['OFFICE', 'Papelería y oficina'],
      ['UTILITIES', 'Servicios públicos y conectividad'],
      ['MEALS', 'Alimentación'],
      ['OTHER', 'Otros gastos'],
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
