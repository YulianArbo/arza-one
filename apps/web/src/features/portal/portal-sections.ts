// Secciones del portal del cliente (boceto final de B22A). Sus pantallas se construyen en B30:
// mientras tanto cada una dice que está disponible pronto y no simula funcionar.

export interface PortalSection {
  /** Parte de la dirección después de /portal; vacía para el inicio. */
  readonly slug: string;
  readonly label: string;
  readonly description: string;
}

export const PORTAL_SECTIONS: readonly PortalSection[] = [
  { slug: '', label: 'Inicio', description: 'Su resumen.' },
  { slug: 'proyectos', label: 'Proyectos', description: 'Avance, hitos y entregables.' },
  {
    slug: 'por-aprobar',
    label: 'Por aprobar',
    description: 'Entregables que esperan su decisión.',
  },
  { slug: 'firmas', label: 'Firmas', description: 'Contratos y otrosíes que requieren su firma.' },
  {
    slug: 'facturas',
    label: 'Facturas',
    description: 'Facturas electrónicas emitidas a su empresa.',
  },
  { slug: 'soporte', label: 'Soporte', description: 'Sus solicitudes y su estado.' },
];

export function portalPath(section: PortalSection): string {
  return section.slug === '' ? '/portal' : `/portal/${section.slug}`;
}

/** La sección de una dirección, o undefined si no existe. */
export function portalSection(slug: string): PortalSection | undefined {
  return PORTAL_SECTIONS.find((section) => section.slug === slug && slug !== '');
}
