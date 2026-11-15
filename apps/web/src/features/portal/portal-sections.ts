// Secciones del portal del cliente (boceto final de B22A, numeral 16.2: Inicio del cliente · Mis
// proyectos · Entregables por aprobar · Contratos y firmas · Facturas · Soporte · Documentos ·
// Usuarios de mi empresa · Mis datos y privacidad). Cada una dice qué permiso la muestra; la API
// decide igual en cada petición. Facturas llega con la facturación (B31).

export interface PortalSection {
  /** Parte de la dirección después de /portal; vacía para el inicio. */
  readonly slug: string;
  readonly label: string;
  readonly description: string;
  /** Permiso que la muestra en las pestañas; sin él, la sección no aparece. */
  readonly permission: string;
}

export const PORTAL_SECTIONS: readonly PortalSection[] = [
  { slug: '', label: 'Inicio', description: 'Su resumen.', permission: 'portal.project.read' },
  {
    slug: 'proyectos',
    label: 'Proyectos',
    description: 'Avance, hitos y entregables.',
    permission: 'portal.project.read',
  },
  {
    slug: 'por-aprobar',
    label: 'Por aprobar',
    description: 'Actas de entrega que esperan su decisión.',
    permission: 'portal.contract.read',
  },
  {
    slug: 'firmas',
    label: 'Contratos y firmas',
    description: 'Sus contratos y los documentos que requieren su firma.',
    permission: 'portal.contract.read',
  },
  {
    slug: 'facturas',
    label: 'Facturas',
    description: 'Facturas electrónicas emitidas a su empresa.',
    permission: 'portal.invoice.read',
  },
  {
    slug: 'soporte',
    label: 'Soporte',
    description: 'Sus solicitudes, sus PQRSF y artículos de ayuda.',
    permission: 'portal.ticket.read',
  },
  {
    slug: 'documentos',
    label: 'Documentos',
    description: 'Contratos y actas firmados, y lo que el equipo le compartió.',
    permission: 'portal.project.read',
  },
  {
    slug: 'usuarios',
    label: 'Usuarios',
    description: 'Las personas de su empresa en el portal.',
    permission: 'portal.user.manage',
  },
  {
    slug: 'mis-datos',
    label: 'Mis datos',
    description: 'Sus datos, su copia y la privacidad.',
    permission: 'portal.personal_data.manage',
  },
];

export function portalPath(section: PortalSection): string {
  return section.slug === '' ? '/portal' : `/portal/${section.slug}`;
}

/** La sección de una dirección, o undefined si no existe. */
export function portalSection(slug: string): PortalSection | undefined {
  return PORTAL_SECTIONS.find((section) => section.slug === slug && slug !== '');
}

/** Rutas de las fichas del portal. */
export const PORTAL_PATHS = {
  home: '/portal',
  projects: '/portal/proyectos',
  project: (id: string) => `/portal/proyectos/${id}`,
  approvals: '/portal/por-aprobar',
  signatures: '/portal/firmas',
  support: '/portal/soporte',
  ticket: (id: string) => `/portal/soporte/${id}`,
  article: (id: string) => `/portal/soporte/ayuda/${id}`,
  documents: '/portal/documentos',
  users: '/portal/usuarios',
  myData: '/portal/mis-datos',
} as const;
