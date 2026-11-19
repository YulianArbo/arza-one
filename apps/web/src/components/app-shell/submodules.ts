import {
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
import { OUTPUT_TEMPLATES_PATH } from '../../features/forms/labels';
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
}

function sub(href: string, label: string, icon: LucideIcon, ...anyOf: string[]): Submodule {
  return { href, label, icon, anyOf };
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
  sub(SERVICE_PATHS.surveys, 'Encuestas y NPS', Smile, 'service.ticket.read'),
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
];

const AUDIT = [
  sub(AUDIT_PATHS.events, 'Consulta de eventos', ListChecks, 'audit.event.read'),
  sub(AUDIT_PATHS.security, 'Eventos de seguridad', ShieldAlert, 'audit.security.read'),
  sub(AUDIT_PATHS.exports, 'Exportaciones', Download, 'audit.event.read'),
  sub(AUDIT_PATHS.integrity, 'Verificación de integridad', ShieldCheck, 'audit.chain.verify'),
];

/** Submódulos por módulo (slug del menú). Los módulos que no figuran se abren desde su portada. */
const SUBMODULES: Readonly<Record<string, readonly Submodule[]>> = {
  comercial: COMMERCIAL,
  servicio: SERVICE,
  compras: PURCHASES,
  finanzas: FINANCE,
  privacidad: PRIVACY,
  administracion: ADMINISTRATION,
  auditoria: AUDIT,
};

/** Submódulos de un módulo que la persona puede abrir. */
export function visibleSubmodules(slug: string, granted: ReadonlySet<string>): Submodule[] {
  return (SUBMODULES[slug] ?? []).filter((entry) => entry.anyOf.some((code) => granted.has(code)));
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
): boolean {
  const current = currentSubmodule(slug, pathname);
  return current !== undefined && visibleSubmodules(slug, granted).includes(current);
}
