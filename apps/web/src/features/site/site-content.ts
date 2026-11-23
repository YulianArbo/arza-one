// Contenido de la vitrina (B22A, boceto final aprobado). Los datos de la empresa entre corchetes
// los entrega el dueño del producto antes de publicar el sitio; no se inventan.

import { BriefcaseBusiness, FolderKanban, Megaphone, Monitor, SquareUser } from 'lucide-react';

export const COMPANY = {
  legalName: 'ARZA TECH S.A.S.',
  taxId: '[NIT]',
  phone: '[TELÉFONO]',
  whatsapp: '[NÚMERO DE WHATSAPP]',
  email: '[CORREO COMERCIAL]',
  address: '[DIRECCIÓN] · [CIUDAD], Colombia',
  hours: '[HORARIO DE ATENCIÓN]',
} as const;

export interface SocialNetwork {
  readonly name: string;
  /** Dirección del perfil; vacía mientras el dueño del producto no la entregue. */
  readonly url: string | null;
  /** Trazo del ícono (24 × 24), dibujado para la vitrina. */
  readonly icon: string;
}

export const SOCIAL_NETWORKS: readonly SocialNetwork[] = [
  {
    name: 'Facebook',
    url: null,
    icon: 'M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z',
  },
  {
    name: 'Instagram',
    url: null,
    icon: 'M7 2h10a5 5 0 0 1 5 5v10a5 5 0 0 1-5 5H7a5 5 0 0 1-5-5V7a5 5 0 0 1 5-5zM16 11.4A4 4 0 1 1 12.6 8 4 4 0 0 1 16 11.4zM17.5 6.5h.01',
  },
  { name: 'X (Twitter)', url: null, icon: 'M4 4l16 16M20 4 4 20' },
  {
    name: 'LinkedIn',
    url: null,
    icon: 'M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-4 0v7h-4v-7a6 6 0 0 1 6-6zM2 9h4v12H2zM4 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
  },
  {
    name: 'WhatsApp',
    url: null,
    icon: 'M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5z',
  },
  {
    name: 'YouTube',
    url: null,
    icon: 'M22.5 6.4a2.8 2.8 0 0 0-1.9-2C18.8 4 12 4 12 4s-6.8 0-8.6.5a2.8 2.8 0 0 0-1.9 2A29 29 0 0 0 1 12a29 29 0 0 0 .5 5.6 2.8 2.8 0 0 0 1.9 2c1.8.4 8.6.4 8.6.4s6.8 0 8.6-.5a2.8 2.8 0 0 0 1.9-2A29 29 0 0 0 23 12a29 29 0 0 0-.5-5.6zM9.8 15.5V8.5l5.7 3.5z',
  },
  { name: 'TikTok', url: null, icon: 'M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.5 2.5 4.5 5 5' },
];

/** Secciones del menú de la vitrina, cada una con su ícono (B22B, boceto 01). */
export const SITE_NAV = [
  { href: '/#servicios', label: 'Servicios', icon: BriefcaseBusiness },
  { href: '/#plataforma', label: 'Plataforma', icon: Monitor },
  { href: '/#proyectos', label: 'Proyectos', icon: FolderKanban },
  { href: '/#noticias', label: 'Noticias', icon: Megaphone },
  { href: '/#contacto', label: 'Contacto', icon: SquareUser },
] as const;

export const SERVICES = [
  { title: 'Software a la medida', text: 'Web, móvil, portales y comercio electrónico.' },
  { title: 'Consultoría digital', text: 'Diagnóstico de madurez y hoja de ruta.' },
  { title: 'Infraestructura cloud', text: 'Migración, operación y monitoreo.' },
  { title: 'Soluciones SaaS', text: 'Productos propios por suscripción.' },
  { title: 'Soporte posventa', text: 'Mesa de ayuda y mantenimiento evolutivo.' },
] as const;

/** Módulos de ARZA ONE que ya funcionan, como se describen en la plataforma. */
export const PLATFORM_MODULES = [
  {
    key: 'documentos',
    name: 'Documental',
    title: 'Listado Maestro',
    text: 'Del borrador a la versión vigente, con revisión, aprobación y constancia de lectura por cargo.',
  },
  {
    key: 'comercial',
    name: 'Comercial',
    title: 'Embudo de oportunidades',
    text: 'Prospectos, oportunidades por etapa, actividades con recordatorio e informe del embudo.',
  },
  {
    key: 'terceros',
    name: 'Terceros',
    title: 'Clientes y proveedores',
    text: 'Contactos, cuentas, conocimiento del tercero y autorizaciones de datos en una sola ficha.',
  },
  {
    key: 'flujos',
    name: 'Flujos y tareas',
    title: 'Mis tareas',
    text: 'Cada solicitud sigue su flujo, con tareas y plazos en días hábiles de Colombia.',
  },
  {
    key: 'privacidad',
    name: 'Privacidad',
    title: 'Ley 1581 al día',
    text: 'Actividades de tratamiento, avisos con versión, autorizaciones y encargados.',
  },
  {
    key: 'auditoria',
    name: 'Auditoría',
    title: 'Trazabilidad verificable',
    text: 'Quién hizo qué, cuándo y desde dónde, en una cadena que no se puede alterar.',
  },
] as const;

export interface LegalText {
  readonly slug: string;
  readonly title: string;
}

/**
 * Textos legales del pie de página (numeral 20.2). Se leen publicados de la API (B41); la política
 * de tratamiento («privacidad») vive en Privacidad.
 */
export const LEGAL_TEXTS: readonly LegalText[] = [
  { slug: 'terminos', title: 'Términos y condiciones' },
  { slug: 'privacidad', title: 'Política de tratamiento de datos' },
  { slug: 'cookies', title: 'Política de cookies' },
  { slug: 'derechos-del-titular', title: 'Derechos del titular' },
  { slug: 'seguridad', title: 'Seguridad y divulgación responsable' },
  { slug: 'avisos-de-terceros', title: 'Avisos de software de terceros' },
  { slug: 'terminos-de-la-plataforma', title: 'Términos de uso de la plataforma' },
];

export function legalPath(text: LegalText): string {
  return `/legal/${text.slug}`;
}
