import {
  Archive,
  BookOpen,
  Building,
  CalendarDays,
  ChartLine,
  ClipboardList,
  Columns3,
  Download,
  FilePlus,
  FileText,
  Filter,
  Handshake,
  Inbox,
  KeyRound,
  LayoutTemplate,
  ListChecks,
  Megaphone,
  MessageSquareWarning,
  Network,
  Package,
  PackageCheck,
  Plane,
  Receipt,
  Scale,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Smile,
  Tags,
  Trash2,
  Truck,
  UserCheck,
  UserCog,
  UserPlus,
  Users,
  Wallet,
  Workflow,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

import { ADMIN_PATHS } from '../../features/administration/labels';
import { AUDIT_PATHS } from '../../features/audit/labels';
import { CRM_PATHS } from '../../features/crm/labels';
import {
  DISPOSITIONS_PATH,
  MASTER_LIST_PATH,
  REQUESTS_PATH,
  RETENTION_PATH,
} from '../../features/documents/labels';
import { FORMS_PATH, OUTPUT_TEMPLATES_PATH, RECORDS_PATH } from '../../features/forms/labels';
import { NTF_PATHS } from '../../features/notifications/labels';
import { PRIVACY_PATHS } from '../../features/privacy/labels';
import { SERVICE_PATHS } from '../../features/service/labels';
import { WF_PATHS } from '../../features/workflows/labels';

/** Submódulo del menú lateral (B22B): una pantalla del módulo y quién puede abrirla. */
export interface Submodule {
  readonly href: string;
  readonly label: string;
  readonly icon: LucideIcon;
  /** Basta con uno. Los mismos permisos que exige la pantalla; la API sigue siendo la barrera. */
  readonly anyOf: readonly string[];
  /** Pide el permiso sobre toda la empresa: quien solo ve lo propio no lo ve. */
  readonly wholeCompany?: boolean;
}

function sub(href: string, label: string, icon: LucideIcon, ...anyOf: string[]): Submodule {
  return { href, label, icon, anyOf };
}

/** Submódulo que pide el permiso sobre toda la empresa, no solo sobre lo propio. */
function companySub(href: string, label: string, icon: LucideIcon, code: string): Submodule {
  return { href, label, icon, anyOf: [code], wholeCompany: true };
}

const COMMERCIAL = [
  sub(CRM_PATHS.funnel, 'Embudo', Filter, 'crm.opportunity.read'),
  sub(CRM_PATHS.leads, 'Prospectos', UserPlus, 'crm.lead.read'),
  sub(CRM_PATHS.quotes, 'Cotizaciones', FileText, 'crm.quote.read'),
  sub(CRM_PATHS.services, 'Portafolio', Tags, 'crm.quote.read'),
  sub(CRM_PATHS.activities, 'Actividades', CalendarDays, 'crm.lead.read'),
  sub(CRM_PATHS.campaigns, 'Campañas', Megaphone, 'crm.lead.read'),
  sub(CRM_PATHS.report, 'Informe', ChartLine, 'crm.report.read'),
];

const SERVICE = [
  sub(SERVICE_PATHS.inbox, 'Tiquetes', Inbox, 'service.ticket.read'),
  sub(SERVICE_PATHS.pqrsfInbox, 'PQRSF', MessageSquareWarning, 'service.pqrsf.read'),
  companySub(SERVICE_PATHS.warranties, 'Garantías', ShieldCheck, 'service.ticket.read'),
  companySub(SERVICE_PATHS.policies, 'Acuerdos', Handshake, 'service.ticket.read'),
  companySub(SERVICE_PATHS.surveys, 'Encuestas y NPS', Smile, 'service.ticket.read'),
  sub(SERVICE_PATHS.knowledge, 'Base de conocimiento', BookOpen, 'service.kb.read'),
];

const PURCHASES = [
  sub(
    '/app/compras/solicitudes',
    'Solicitudes',
    FilePlus,
    'purchase.read',
    'purchase.request.create',
  ),
  sub('/app/compras/cuadro-comparativo', 'Cuadro comparativo', Columns3, 'purchase.read'),
  sub('/app/compras/ordenes', 'Órdenes', ClipboardList, 'purchase.read'),
  sub('/app/compras/recepciones', 'Recepciones', PackageCheck, 'purchase.read'),
  sub('/app/compras/proveedores', 'Proveedores', Truck, 'purchase.read'),
  sub('/app/compras/viajes', 'Viajes', Plane, 'purchase.read', 'purchase.travel.request'),
  sub('/app/compras/activos', 'Activos', Package, 'asset.read'),
  sub('/app/compras/activos/mantenimientos', 'Mantenimientos', Wrench, 'asset.read'),
];

const DOCUMENTS = [
  sub(MASTER_LIST_PATH, 'Listado maestro', ListChecks, 'doc.document.read'),
  sub(RECORDS_PATH, 'Registros', ClipboardList, 'doc.document.read'),
  sub(FORMS_PATH, 'Formatos', LayoutTemplate, 'doc.document.read'),
  sub(REQUESTS_PATH, 'Solicitudes', FilePlus, 'doc.document.read'),
  sub(RETENTION_PATH, 'Retención', Archive, 'doc.retention.manage'),
  sub(DISPOSITIONS_PATH, 'Disposición', Trash2, 'doc.disposition.approve'),
];

const FINANCE = [
  sub('/app/finanzas/facturas', 'Facturas y recaudos', Receipt, 'finance.invoice.read'),
  sub('/app/finanzas/presupuesto', 'Presupuesto', ChartLine, 'finance.budget.read'),
  sub('/app/finanzas/gastos', 'Gastos', Wallet, 'finance.ledger.read', 'finance.expense.manage'),
  sub('/app/finanzas/caja-menor', 'Caja menor', Wallet, 'finance.ledger.read'),
  sub('/app/finanzas/conciliaciones', 'Conciliación bancaria', Scale, 'finance.ledger.read'),
  sub(
    '/app/finanzas/certificaciones',
    'Certificación de costos',
    ListChecks,
    'finance.ledger.read',
  ),
  sub('/app/finanzas/cierre', 'Cierre y exportación', Download, 'finance.ledger.read'),
  sub(
    '/app/finanzas/parametros-tributarios',
    'Parámetros tributarios',
    SlidersHorizontal,
    'finance.tax_parameter.manage',
  ),
];

const PRIVACY = [
  sub(PRIVACY_PATHS.activities, 'Actividades de tratamiento', Workflow, 'privacy.activity.manage'),
  sub(PRIVACY_PATHS.notices, 'Avisos y versiones', FileText, 'privacy.notice.manage'),
  sub(PRIVACY_PATHS.consents, 'Autorizaciones', ShieldCheck, 'privacy.consent.read'),
  sub(PRIVACY_PATHS.processors, 'Encargados', Handshake, 'privacy.processor.manage'),
];

const ADMINISTRATION = [
  sub(ADMIN_PATHS.users, 'Usuarios', Users, 'iam.user.read'),
  sub(ADMIN_PATHS.roles, 'Roles y permisos', KeyRound, 'iam.role.read'),
  sub(ADMIN_PATHS.delegations, 'Delegaciones', UserCog, 'iam.delegation.manage'),
  sub(ADMIN_PATHS.accessReview, 'Revisión de accesos', UserCheck, 'iam.access_review.read'),
  sub(WF_PATHS.definitions, 'Flujos', Workflow, 'wf.definition.manage'),
  sub(NTF_PATHS.templates, 'Plantillas de aviso', LayoutTemplate, 'ntf.template.manage'),
  sub(OUTPUT_TEMPLATES_PATH, 'Plantillas de salida', LayoutTemplate, 'doc.form_template.manage'),
  sub(ADMIN_PATHS.company, 'Empresa y sedes', Building, 'core.tenant.read'),
  sub(ADMIN_PATHS.structure, 'Procesos y cargos', Network, 'core.org.read'),
  sub(ADMIN_PATHS.costCenters, 'Centros de costo', Wallet, 'core.org.read'),
  sub(ADMIN_PATHS.catalogs, 'Catálogos', Tags, 'core.parameter.read'),
  sub(ADMIN_PATHS.parameters, 'Parámetros', SlidersHorizontal, 'core.parameter.read'),
  sub(ADMIN_PATHS.sequences, 'Consecutivos', ListChecks, 'core.sequence.manage'),
  sub(ADMIN_PATHS.holidays, 'Festivos', CalendarDays, 'core.parameter.read'),
  sub(ADMIN_PATHS.announcements, 'Comunicados', Megaphone, 'core.announcement.manage'),
];

const AUDIT = [
  sub(AUDIT_PATHS.events, 'Consulta de eventos', ListChecks, 'audit.event.read'),
  sub(AUDIT_PATHS.security, 'Eventos de seguridad', ShieldAlert, 'audit.security.read'),
  sub(AUDIT_PATHS.exports, 'Exportaciones', Download, 'audit.event.read'),
  sub(AUDIT_PATHS.integrity, 'Verificación de integridad', ShieldCheck, 'audit.chain.verify'),
];

// Talento humano (B36): las páginas de la segunda parte del módulo, cada una con su permiso.
const TALENT = [
  sub(
    '/app/talento-y-sst/ausencias',
    'Permisos y vacaciones',
    CalendarDays,
    'hr.leave.approve',
    'hr.overtime.authorize',
  ),
  sub('/app/talento-y-sst/nomina', 'Novedades de nómina', Wallet, 'hr.payroll_novelty.close'),
  sub(
    '/app/talento-y-sst/desempeno',
    'Desempeño y formación',
    ChartLine,
    'hr.performance.manage',
    'hr.training.manage',
  ),
  sub('/app/talento-y-sst/disciplinarios', 'Disciplinarios', Scale, 'hr.disciplinary.manage'),
  sub('/app/talento-y-sst/retiros', 'Retiros', UserCheck, 'hr.offboarding.manage'),
];

/** Submódulos por módulo (slug del menú). Los módulos que no figuran se abren desde su portada. */
const SUBMODULES: Readonly<Record<string, readonly Submodule[]>> = {
  comercial: COMMERCIAL,
  servicio: SERVICE,
  compras: PURCHASES,
  documentos: DOCUMENTS,
  finanzas: FINANCE,
  'talento-y-sst': TALENT,
  privacidad: PRIVACY,
  administracion: ADMINISTRATION,
  auditoria: AUDIT,
};

/**
 * Submódulos de un módulo que la persona puede abrir. `grantedAll` son los permisos sobre toda la
 * empresa; sin él, se toman los mismos de `granted`.
 */
export function visibleSubmodules(
  slug: string,
  granted: ReadonlySet<string>,
  grantedAll: ReadonlySet<string> = granted,
): Submodule[] {
  return (SUBMODULES[slug] ?? []).filter((entry) => {
    const pool = entry.wholeCompany === true ? grantedAll : granted;
    return entry.anyOf.some((code) => pool.has(code));
  });
}

function matches(href: string, pathname: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Submódulo de la dirección actual: el de dirección más larga que la contiene. */
export function currentSubmodule(slug: string, pathname: string): Submodule | undefined {
  return (SUBMODULES[slug] ?? [])
    .filter((entry) => matches(entry.href, pathname))
    .sort((left, right) => right.href.length - left.href.length)[0];
}

/** La página actual es un submódulo que la persona ve en el menú. */
export function inVisibleSubmodule(
  slug: string,
  pathname: string,
  granted: ReadonlySet<string>,
  grantedAll: ReadonlySet<string> = granted,
): boolean {
  const current = currentSubmodule(slug, pathname);
  return current !== undefined && visibleSubmodules(slug, granted, grantedAll).includes(current);
}
