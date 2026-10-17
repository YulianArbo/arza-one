import {
  Activity,
  BadgeCheck,
  BookUser,
  BriefcaseBusiness,
  ChartColumn,
  FileSignature,
  FileText,
  FolderKanban,
  Headset,
  House,
  Landmark,
  ListTodo,
  Paperclip,
  Palette,
  ScrollText,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from 'lucide-react';

export const APP_HOME = '/app';

export interface NavigationItem {
  /** Segmento de la dirección: /app/<slug>. Vacío para Inicio. */
  slug: string;
  label: string;
  icon: LucideIcon;
  /** Permisos del anexo G; basta con tener uno. Sin permisos, todos lo ven. */
  permissions: readonly string[];
  /** Bloque que construye el módulo, para la pantalla «en construcción». */
  block?: string;
}

export interface NavigationGroup {
  label: string;
  items: readonly NavigationItem[];
}

// Módulos del menú lateral, en el orden de la figura 16.3.
const MODULES: readonly NavigationItem[] = [
  { slug: '', label: 'Inicio', icon: House, permissions: [] },
  {
    slug: 'mis-tareas',
    label: 'Mis tareas',
    icon: ListTodo,
    permissions: ['wf.task.work', 'wf.task.read_all'],
  },
  { slug: 'terceros', label: 'Terceros', icon: BookUser, permissions: ['party.read'] },
  {
    slug: 'comercial',
    label: 'Comercial',
    icon: BriefcaseBusiness,
    permissions: ['crm.lead.read', 'crm.opportunity.read'],
    block: 'B22',
  },
  {
    slug: 'contratos',
    label: 'Contratos',
    icon: FileSignature,
    permissions: ['contract.read'],
    block: 'B24',
  },
  {
    slug: 'proyectos',
    label: 'Proyectos',
    icon: FolderKanban,
    permissions: ['project.read_all', 'project.read_member'],
    block: 'B26',
  },
  {
    slug: 'servicio',
    label: 'Servicio',
    icon: Headset,
    permissions: ['service.ticket.read', 'service.pqrsf.read'],
    block: 'B28',
  },
  {
    slug: 'documentos',
    label: 'Documentos',
    icon: FileText,
    permissions: ['doc.document.read'],
    block: 'B18',
  },
  { slug: 'archivos', label: 'Archivos', icon: Paperclip, permissions: ['doc.document.read'] },
  {
    slug: 'calidad',
    label: 'Calidad',
    icon: BadgeCheck,
    permissions: ['qms.nonconformity.create'],
    block: 'B38',
  },
  {
    slug: 'finanzas',
    label: 'Finanzas',
    icon: Landmark,
    permissions: ['finance.invoice.read', 'finance.budget.read'],
    block: 'B31',
  },
  {
    slug: 'talento-y-sst',
    label: 'Talento y SST',
    icon: Users,
    permissions: ['hr.employee.read', 'sst.plan.manage'],
    block: 'B35',
  },
  {
    slug: 'indicadores',
    label: 'Indicadores',
    icon: ChartColumn,
    permissions: [
      'dashboard.executive.read',
      'dashboard.process.read',
      'dashboard.compliance.read',
    ],
    block: 'B46',
  },
  {
    slug: 'privacidad',
    label: 'Privacidad',
    icon: ShieldCheck,
    permissions: [
      'privacy.notice.manage',
      'privacy.consent.read',
      'privacy.activity.manage',
      'privacy.processor.manage',
    ],
  },
  {
    slug: 'administracion',
    label: 'Administración',
    icon: Settings,
    permissions: [
      'core.tenant.update',
      'core.org.manage',
      'core.catalog.manage',
      'core.parameter.manage',
      'core.sequence.manage',
      'iam.user.read',
      'iam.role.read',
      'iam.delegation.manage',
      'iam.access_review.read',
      'wf.definition.manage',
      'ntf.template.manage',
    ],
  },
  {
    slug: 'auditoria',
    label: 'Auditoría',
    icon: ScrollText,
    permissions: ['audit.event.read', 'audit.security.read', 'audit.chain.verify'],
  },
];

// Pantallas de la plataforma construidas en B04.
const PLATFORM: readonly NavigationItem[] = [
  {
    slug: 'estado-del-sistema',
    label: 'Estado del sistema',
    icon: Activity,
    permissions: ['core.parameter.read'],
  },
  { slug: 'sistema-de-diseno', label: 'Sistema de diseño', icon: Palette, permissions: [] },
];

const APP_NAVIGATION: readonly NavigationGroup[] = [
  { label: 'Módulos', items: MODULES },
  { label: 'Plataforma', items: PLATFORM },
];

const ALL_ITEMS = APP_NAVIGATION.flatMap((group) => group.items);

export function hrefFor(item: NavigationItem): string {
  return item.slug === '' ? APP_HOME : `${APP_HOME}/${item.slug}`;
}

/** El menú solo muestra lo que el usuario puede usar (16.3). La API sigue siendo la barrera. */
export function canSee(item: NavigationItem, granted: ReadonlySet<string>): boolean {
  return (
    item.permissions.length === 0 || item.permissions.some((permission) => granted.has(permission))
  );
}

export function visibleNavigation(granted: ReadonlySet<string>): NavigationGroup[] {
  return APP_NAVIGATION.map((group) => ({
    label: group.label,
    items: group.items.filter((item) => canSee(item, granted)),
  })).filter((group) => group.items.length > 0);
}

export function findNavigationItem(slug: string): NavigationItem | undefined {
  return ALL_ITEMS.find((item) => item.slug === slug);
}

/** Inicio solo está activo en /app; los demás también en sus páginas internas. */
export function isActive(item: NavigationItem, pathname: string): boolean {
  const href = hrefFor(item);
  return pathname === href || (item.slug !== '' && pathname.startsWith(`${href}/`));
}

/** Ruta de navegación de la barra superior: Inicio › módulo actual. */
export function breadcrumbFor(pathname: string): NavigationItem[] {
  const [, , slug] = pathname.split('/');
  const home = findNavigationItem('');
  const current = slug ? findNavigationItem(slug) : undefined;
  return [home, current].filter((item): item is NavigationItem => item !== undefined);
}

/** Todos los permisos que pide el menú. */
export function navigationPermissions(): ReadonlySet<string> {
  return new Set(ALL_ITEMS.flatMap((item) => item.permissions));
}
