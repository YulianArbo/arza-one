import type { SystemRoleCode } from './role-matrix.js';

// Roles del sistema (numeral 15.2) y las reglas de su asignación (B10). Los roles del sistema no
// se editan; los ajustes se hacen en roles personalizados (ficha 17.2).

/** Para quién es un rol: la aplicación interna o el portal del cliente. */
export type RoleAudience = 'internal' | 'portal';

export interface SystemRoleDefinition {
  readonly code: SystemRoleCode;
  readonly name: string;
  readonly description: string;
  readonly audience: RoleAudience;
  /** Solo existe en la empresa que opera la plataforma (B48). */
  readonly operatorOnly?: boolean;
}

export const SYSTEM_ROLES: readonly SystemRoleDefinition[] = [
  {
    code: 'DIRECCION',
    name: 'Dirección',
    description:
      'Director General. Lectura transversal, aprobaciones de alto nivel, firma de contratos, tableros.',
    audience: 'internal',
  },
  {
    code: 'ADMIN_PLATAFORMA',
    name: 'Administrador de plataforma',
    description:
      'Responsable técnico. Usuarios, roles, parámetros, flujos y catálogos, sin acceso al contenido restringido por el solo hecho de administrar.',
    audience: 'internal',
  },
  {
    code: 'CALIDAD',
    name: 'Calidad',
    description:
      'Coordinador de Calidad e Innovación. Control documental, riesgos, no conformidades, auditorías, indicadores.',
    audience: 'internal',
  },
  {
    code: 'COMERCIAL',
    name: 'Comercial',
    description:
      'Gerente y analistas comerciales. Prospectos, oportunidades, cotizaciones, clientes; contratos en borrador.',
    audience: 'internal',
  },
  {
    code: 'LIDER_TECNICO',
    name: 'Líder técnico',
    description:
      'Gerente de Desarrollo, líder técnico. Todos los proyectos, liberaciones, incidentes.',
    audience: 'internal',
  },
  {
    code: 'EQUIPO_PROYECTO',
    name: 'Equipo de proyecto',
    description: 'Desarrolladores, QA, diseñadores. Solo los proyectos donde es miembro.',
    audience: 'internal',
  },
  {
    code: 'SERVICIO',
    name: 'Servicio al cliente',
    description:
      'Líder y técnicos de servicio al cliente. Tiquetes, PQRSF, encuestas, base de conocimiento.',
    audience: 'internal',
  },
  {
    code: 'ADMIN_FINANCIERO',
    name: 'Administrativo y financiero',
    description:
      'Gerente administrativo, asistente. Facturación, cartera, compras, activos, presupuesto, caja menor.',
    audience: 'internal',
  },
  {
    code: 'CONTADOR',
    name: 'Contador',
    description:
      'Contador Público externo. Lectura financiera, exportaciones contables, parámetros tributarios.',
    audience: 'internal',
  },
  {
    code: 'TALENTO_HUMANO',
    name: 'Talento humano',
    description:
      'Coordinador de talento humano. Colaboradores, selección, novedades, formación, disciplinarios.',
    audience: 'internal',
  },
  {
    code: 'SST',
    name: 'Seguridad y salud en el trabajo',
    description:
      'Líder de SST. Módulo de SST, incluidos los conceptos de aptitud; nunca diagnósticos.',
    audience: 'internal',
  },
  {
    code: 'OFICIAL_DATOS',
    name: 'Oficial de protección de datos',
    description:
      'Oficial de Protección de Datos. Módulo de privacidad, consentimientos, solicitudes de titulares.',
    audience: 'internal',
  },
  {
    code: 'COLABORADOR',
    name: 'Colaborador',
    description:
      'Todo colaborador. Sus tareas, sus solicitudes, sus datos, documentos vigentes de su proceso.',
    audience: 'internal',
  },
  {
    code: 'AUDITOR',
    name: 'Auditor',
    description:
      'Auditor interno o externo. Solo lectura de evidencias y auditoría, por tiempo limitado.',
    audience: 'internal',
  },
  {
    code: 'OPERADOR_PLATAFORMA',
    name: 'Operador de la plataforma',
    description:
      'Solo en la empresa que opera ARZA ONE. Alta, plan, suspensión y eliminación de empresas; ve su ficha, nunca su contenido.',
    audience: 'internal',
    operatorOnly: true,
  },
  {
    code: 'CLIENTE_ADMIN',
    name: 'Administrador del cliente',
    description:
      'Contacto principal del cliente. Todo lo de su organización en el portal; gestiona sus usuarios.',
    audience: 'portal',
  },
  {
    code: 'CLIENTE_USUARIO',
    name: 'Usuario del cliente',
    description: 'Otros usuarios del cliente. Proyectos y tiquetes que se le asignen.',
    audience: 'portal',
  },
];

/** Reglas de asignación aprobadas en B10. */
export const ACCESS_RULES = {
  /** Rol que recibe toda persona interna al ser invitada. */
  defaultInternalRole: 'COLABORADOR',
  /** El auditor siempre tiene vencimiento, de 90 días como máximo (numeral 15.2). */
  auditorRole: 'AUDITOR',
  auditorMaxDays: 90,
  /** El administrador del cliente exige segundo factor (numeral 15.1). */
  secondFactorRole: 'CLIENTE_ADMIN',
  /** Rol de la empresa que opera la plataforma (B48); como toda cuenta interna, con segundo factor. */
  operatorRole: 'OPERADOR_PLATAFORMA',
  /** Duración máxima de una delegación de aprobaciones. */
  delegationMaxDays: 60,
  /** Cuentas sin uso en el informe de revisión de accesos (ficha 17.2). */
  unusedAccountDays: 60,
} as const satisfies Readonly<Record<string, SystemRoleCode | number>>;
