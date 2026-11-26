import {
  Activity,
  BadgeCheck,
  BookUser,
  BriefcaseBusiness,
  Building2,
  CalendarClock,
  ChartColumn,
  FileSignature,
  FileText,
  FolderKanban,
  Handshake,
  Headset,
  House,
  Landmark,
  Globe,
  Lightbulb,
  ListTodo,
  Paperclip,
  Palette,
  Scale,
  ScrollText,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Sun,
  UserRound,
  Users,
  type LucideIcon,
} from 'lucide-react';

import { currentSubmodule } from './submodules';

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
  /** Identificador estable del grupo, para recordar si la persona lo contrajo. */
  key: string;
  label: string;
  /** Sin ícono, el grupo no lleva encabezado: es el caso de Inicio. */
  icon?: LucideIcon;
  items: readonly NavigationItem[];
}

// Módulos del menú lateral (16.3), en los grupos de los bocetos de B22B.
const MODULES: readonly NavigationItem[] = [
  { slug: '', label: 'Inicio', icon: House, permissions: [] },
  {
    slug: 'mis-tareas',
    label: 'Mis tareas',
    icon: ListTodo,
    permissions: ['wf.task.work', 'wf.task.read_all'],
  },
  {
    slug: 'mi-espacio',
    label: 'Mi espacio',
    icon: UserRound,
    permissions: ['hr.employee.read'],
  },
  { slug: 'terceros', label: 'Terceros', icon: BookUser, permissions: ['party.read'] },
  {
    slug: 'comercial',
    label: 'Comercial',
    icon: BriefcaseBusiness,
    permissions: ['crm.lead.read', 'crm.opportunity.read'],
  },
  {
    slug: 'contratos',
    label: 'Contratos',
    icon: FileSignature,
    permissions: ['contract.read'],
  },
  {
    slug: 'proyectos',
    label: 'Proyectos',
    icon: FolderKanban,
    permissions: ['project.read_all', 'project.read_member'],
  },
  {
    slug: 'servicio',
    label: 'Servicio',
    icon: Headset,
    permissions: ['service.ticket.read', 'service.pqrsf.read', 'service.kb.read'],
  },
  {
    slug: 'documentos',
    label: 'Documentos',
    icon: FileText,
    permissions: ['doc.document.read'],
  },
  { slug: 'archivos', label: 'Archivos', icon: Paperclip, permissions: ['doc.document.read'] },
  {
    slug: 'calidad',
    label: 'Calidad',
    icon: BadgeCheck,
    permissions: ['qms.read', 'qms.nonconformity.create'],
  },
  {
    slug: 'innovacion',
    label: 'Innovación',
    icon: Lightbulb,
    permissions: ['inn.read', 'inn.idea.create'],
  },
  {
    slug: 'finanzas',
    label: 'Finanzas',
    icon: Landmark,
    permissions: [
      'finance.invoice.read',
      'finance.budget.read',
      'finance.tax_parameter.manage',
      'finance.ledger.read',
      'finance.expense.manage',
    ],
  },
  {
    slug: 'compras',
    label: 'Compras',
    icon: ShoppingCart,
    permissions: [
      'purchase.read',
      'purchase.request.create',
      'purchase.travel.request',
      'asset.read',
    ],
  },
  {
    slug: 'talento-y-sst',
    label: 'Talento y SST',
    icon: Users,
    permissions: ['hr.employee.read', 'hr.vacancy.manage', 'hr.candidate.manage', 'sst.read'],
  },
  {
    // Tableros de la Dirección y normograma (M16, B46).
    slug: 'direccion',
    label: 'Dirección',
    icon: ChartColumn,
    permissions: [
      'dashboard.executive.read',
      'dashboard.process.read',
      'dashboard.compliance.read',
    ],
  },
  {
    slug: 'sitio-web',
    label: 'Sitio web',
    icon: Globe,
    permissions: [
      'web.page.manage',
      'web.legal_text.manage',
      'web.legal_text.publish',
      'web.submission.read',
    ],
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

const ITEMS = [...MODULES, ...PLATFORM];

function pick(...slugs: readonly string[]): NavigationItem[] {
  return slugs.flatMap((slug) => ITEMS.filter((item) => item.slug === slug));
}

const APP_NAVIGATION: readonly NavigationGroup[] = [
  { key: 'inicio', label: 'Inicio', items: pick('') },
  { key: 'trabajo', label: 'Trabajo diario', icon: Sun, items: pick('mis-tareas', 'mi-espacio') },
  {
    key: 'clientes',
    label: 'Clientes y operación',
    icon: Handshake,
    items: pick('terceros', 'comercial', 'contratos', 'proyectos', 'servicio'),
  },
  {
    key: 'gestion',
    label: 'Gestión interna',
    icon: Building2,
    items: pick('compras', 'finanzas', 'talento-y-sst', 'documentos', 'archivos'),
  },
  {
    key: 'gobierno',
    label: 'Gobierno',
    icon: Scale,
    items: pick(
      'direccion',
      'calidad',
      'innovacion',
      'sitio-web',
      'privacidad',
      'administracion',
      'auditoria',
      'estado-del-sistema',
      'sistema-de-diseno',
    ),
  },
  {
    key: 'posteriores',
    label: 'Bloques posteriores',
    icon: CalendarClock,
    items: ITEMS.filter((item) => item.block !== undefined),
  },
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
    ...group,
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

/** Módulo de una página interna, para el enlace «Volver a [módulo]». En el módulo, ninguno. */
export function parentModuleFor(pathname: string): NavigationItem | undefined {
  const [, , slug, ...rest] = pathname.split('/');
  if (!slug || rest.filter(Boolean).length === 0) {
    return undefined;
  }
  return findNavigationItem(slug);
}

/** Un paso de la ruta de navegación. */
export interface Crumb {
  readonly href: string;
  readonly label: string;
}

function crumbOf(item: NavigationItem): Crumb {
  return { href: hrefFor(item), label: item.label };
}

/** Ruta de navegación de la barra superior: Inicio › módulo › submódulo (B22B). */
export function breadcrumbFor(pathname: string): Crumb[] {
  const [, , slug] = pathname.split('/');
  const home = findNavigationItem('');
  const current = slug ? findNavigationItem(slug) : undefined;
  const crumbs = [home, current]
    .filter((item): item is NavigationItem => item !== undefined)
    .map(crumbOf);
  const sub = current ? currentSubmodule(current.slug, pathname) : undefined;
  if (current && sub && sub.href !== hrefFor(current)) {
    crumbs.push({ href: sub.href, label: sub.label });
  }
  return crumbs;
}

/** Todos los permisos que pide el menú. */
export function navigationPermissions(): ReadonlySet<string> {
  return new Set(ALL_ITEMS.flatMap((item) => item.permissions));
}
