import type { PermissionCode } from '../iam/permissions.js';

// Fichas de las cifras de los tableros de la Dirección (B46, ficha 17.17). Cada cifra dice cómo
// se calcula («Los cálculos se documentan en la ficha del indicador»), qué permiso hace falta
// para ver su listado de origen (decisión 3: nadie ve por un indicador lo que no puede ver por el
// listado) y a qué pantalla lleva. Los cálculos se hacen al momento (decisión 11).

export const DASHBOARD_KEYS = {
  executive: 'Tablero gerencial',
  scorecard: 'Cuadro de mando',
  compliance: 'Tablero de cumplimiento',
} as const;
export type DashboardKey = keyof typeof DASHBOARD_KEYS;

/** Permiso de cada tablero (anexo G). */
export const DASHBOARD_PERMISSIONS = {
  executive: 'dashboard.executive.read',
  scorecard: 'dashboard.process.read',
  compliance: 'dashboard.compliance.read',
} as const satisfies Record<DashboardKey, PermissionCode>;

export const FIGURE_UNITS = {
  pesos: 'Pesos',
  count: 'Número',
  percent: '%',
  score: 'Puntaje de 1 a 5',
} as const;
export type FigureUnit = keyof typeof FIGURE_UNITS;

export interface FigureDefinition {
  readonly dashboard: Exclude<DashboardKey, 'scorecard'>;
  readonly label: string;
  readonly unit: FigureUnit;
  /** Ficha: cómo se calcula, en palabras. */
  readonly how: string;
  /** Permiso, sin límite a «lo propio», que deja ver el listado de origen. */
  readonly source: PermissionCode;
  /** Pantalla con el listado completo en su módulo. */
  readonly link: string;
}

const EXECUTIVE_FIGURES = {
  sales_month: {
    dashboard: 'executive',
    label: 'Ventas facturadas del mes',
    unit: 'pesos',
    how: 'Suma del subtotal (sin IVA) de las facturas emitidas en el mes en curso, menos las notas crédito del mes. No cuenta las anuladas.',
    source: 'finance.invoice.read',
    link: '/app/finanzas/facturas',
  },
  sales_year: {
    dashboard: 'executive',
    label: 'Ventas facturadas del año',
    unit: 'pesos',
    how: 'Suma del subtotal (sin IVA) de las facturas emitidas desde el 1 de enero, menos las notas crédito del año. No cuenta las anuladas.',
    source: 'finance.invoice.read',
    link: '/app/finanzas/facturas',
  },
  pipeline_open: {
    dashboard: 'executive',
    label: 'Oportunidades abiertas',
    unit: 'pesos',
    how: 'Suma del valor estimado de las oportunidades que no se han ganado ni perdido.',
    source: 'crm.opportunity.read',
    link: '/app/comercial/oportunidades',
  },
  receivables_open: {
    dashboard: 'executive',
    label: 'Cartera por cobrar',
    unit: 'pesos',
    how: 'Saldo de las facturas emitidas o con abono: total menos recaudos y notas crédito.',
    source: 'finance.invoice.read',
    link: '/app/finanzas/facturas',
  },
  receivables_overdue: {
    dashboard: 'executive',
    label: 'Cartera vencida',
    unit: 'pesos',
    how: 'La parte de la cartera por cobrar cuyas facturas ya pasaron su fecha de vencimiento.',
    source: 'finance.invoice.read',
    link: '/app/finanzas/facturas',
  },
  projects_at_risk: {
    dashboard: 'executive',
    label: 'Proyectos en riesgo',
    unit: 'count',
    how: 'Proyectos cuyo estado es «En riesgo».',
    source: 'project.read_all',
    link: '/app/proyectos',
  },
  satisfaction: {
    dashboard: 'executive',
    label: 'Satisfacción de los clientes',
    unit: 'score',
    how: 'Promedio de la satisfacción (1 a 5) de las encuestas respondidas en los últimos 90 días. Sin respuestas no hay cifra.',
    source: 'service.ticket.read',
    link: '/app/servicio/encuestas',
  },
  legal_compliance: {
    dashboard: 'executive',
    label: 'Cumplimiento legal',
    unit: 'percent',
    how: 'Requisitos que aplican cuya última evaluación es «Cumple» ÷ requisitos que aplican y tienen evaluación × 100.',
    source: 'qms.read',
    link: '/app/direccion/normograma',
  },
} as const satisfies Record<string, FigureDefinition>;

const COMPLIANCE_FIGURES = {
  accounts_without_mfa: {
    dashboard: 'compliance',
    label: 'Cuentas internas sin segundo factor',
    unit: 'count',
    how: 'Cuentas internas activas que no han configurado el segundo factor de acceso.',
    source: 'iam.access_review.read',
    link: '/app/administracion/revision-de-accesos',
  },
  inactive_accounts: {
    dashboard: 'compliance',
    label: 'Cuentas sin ingresar en 90 días',
    unit: 'count',
    how: 'Cuentas internas activas cuyo último ingreso fue hace más de 90 días o que nunca han ingresado.',
    source: 'iam.access_review.read',
    link: '/app/administracion/revision-de-accesos',
  },
  platform_admins: {
    dashboard: 'compliance',
    label: 'Administradores de la plataforma',
    unit: 'count',
    how: 'Cuentas activas con el rol Administrador de plataforma.',
    source: 'iam.access_review.read',
    link: '/app/administracion/revision-de-accesos',
  },
  sod_conflicts: {
    dashboard: 'compliance',
    label: 'Personas con funciones en conflicto',
    unit: 'count',
    how: 'Cuentas activas que, por sus roles, tienen los dos permisos de alguno de los pares que deben estar en manos distintas. Es una alerta, no un bloqueo.',
    source: 'iam.access_review.read',
    link: '/app/administracion/revision-de-accesos',
  },
  overdue_tasks: {
    dashboard: 'compliance',
    label: 'Tareas vencidas',
    unit: 'count',
    how: 'Tareas pendientes de todas las personas cuya fecha límite ya pasó.',
    source: 'wf.task.read_all',
    link: '/app/mis-tareas',
  },
  documents_in_review: {
    dashboard: 'compliance',
    label: 'Versiones de documentos por revisar o aprobar',
    unit: 'count',
    how: 'Versiones de documentos en revisión o aprobadas sin publicar.',
    source: 'doc.document.read',
    link: '/app/documentos',
  },
  change_requests_pending: {
    dashboard: 'compliance',
    label: 'Solicitudes de cambio documental pendientes',
    unit: 'count',
    how: 'Solicitudes de cambio documental que esperan decisión.',
    source: 'doc.document.read',
    link: '/app/documentos/solicitudes',
  },
  legal_pending: {
    dashboard: 'compliance',
    label: 'Requisitos legales sin evaluar en el semestre',
    unit: 'count',
    how: 'Requisitos del normograma que aplican y no tienen evaluación en el semestre en curso.',
    source: 'qms.read',
    link: '/app/direccion/normograma',
  },
  legal_failing: {
    dashboard: 'compliance',
    label: 'Requisitos legales que no se cumplen',
    unit: 'count',
    how: 'Requisitos que aplican cuya última evaluación es «Cumple parcialmente» o «No cumple».',
    source: 'qms.read',
    link: '/app/direccion/normograma',
  },
} as const satisfies Record<string, FigureDefinition>;

export const DASHBOARD_FIGURES = { ...EXECUTIVE_FIGURES, ...COMPLIANCE_FIGURES } as const;
export type FigureKey = keyof typeof DASHBOARD_FIGURES;
export type ExecutiveFigureKey = keyof typeof EXECUTIVE_FIGURES;
export type ComplianceFigureKey = keyof typeof COMPLIANCE_FIGURES;

export const EXECUTIVE_FIGURE_KEYS = Object.keys(EXECUTIVE_FIGURES) as ExecutiveFigureKey[];
export const COMPLIANCE_FIGURE_KEYS = Object.keys(COMPLIANCE_FIGURES) as ComplianceFigureKey[];
export const FIGURE_KEYS = Object.keys(DASHBOARD_FIGURES) as [FigureKey, ...FigureKey[]];

/** Pares de permisos que deben estar en manos distintas (decisión 9, por validar). */
export const SOD_CONFLICTS = [
  {
    key: 'invoice',
    label: 'Solicitar y aprobar facturas',
    permissions: ['finance.invoice.request', 'finance.invoice.approve'],
  },
  {
    key: 'expense',
    label: 'Registrar y aprobar gastos',
    permissions: ['finance.expense.manage', 'finance.expense.approve'],
  },
  {
    key: 'payment',
    label: 'Registrar recaudos y conciliar los bancos',
    permissions: ['finance.payment.manage', 'finance.reconciliation.manage'],
  },
  {
    key: 'purchase',
    label: 'Emitir y recibir órdenes de compra',
    permissions: ['purchase.order.issue', 'purchase.order.receive'],
  },
  {
    key: 'roles',
    label: 'Crear roles y asignarlos',
    permissions: ['iam.role.manage', 'iam.role.assign'],
  },
] as const satisfies readonly {
  readonly key: string;
  readonly label: string;
  readonly permissions: readonly [PermissionCode, PermissionCode];
}[];
export type SodConflict = (typeof SOD_CONFLICTS)[number];

/** Los pares en conflicto que reúne un conjunto de permisos. */
export function sodConflictsOf(permissions: ReadonlySet<string>): SodConflict[] {
  return SOD_CONFLICTS.filter((conflict) =>
    conflict.permissions.every((permission) => permissions.has(permission)),
  );
}
