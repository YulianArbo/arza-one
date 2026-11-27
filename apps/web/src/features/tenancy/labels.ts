import type { TenantExportStatus, TenantPlan, TenantStatus } from '@arza/contracts';

// Textos de multiempresa (B48) en español de Colombia, con trato de usted.

export const BRANDING_PATH = '/v1/me/branding';
export const BRANDING_LOGO_PATH = '/v1/me/branding/logo';

export const PLAN_LABELS: Readonly<Record<TenantPlan, string>> = {
  basic: 'Básico',
  professional: 'Profesional',
  enterprise: 'Empresarial',
};

export const STATUS_LABELS: Readonly<Record<TenantStatus, string>> = {
  active: 'Activa',
  suspended: 'Suspendida',
  closed: 'Cerrada',
};

export const EXPORT_STATUS_LABELS: Readonly<Record<TenantExportStatus, string>> = {
  queued: 'En cola',
  running: 'Generándose',
  ready: 'Lista para descargar',
  failed: 'Falló',
  expired: 'Vencida',
};

/** Número con separador de miles de Colombia. */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat('es-CO').format(value);
}

/** Tope de usuarios: «Sin tope» cuando no tiene. */
export function limitLabel(value: number | null): string {
  return value === null ? 'Sin tope' : formatNumber(value);
}

/** Megabytes como GB con un decimal, o MB si es poco. */
export function storageLabel(megabytes: number): string {
  if (megabytes < 1024) return `${formatNumber(Math.round(megabytes))} MB`;
  return `${new Intl.NumberFormat('es-CO', { maximumFractionDigits: 1 }).format(megabytes / 1024)} GB`;
}

/** Fecha dd/mm/aaaa en la hora de Bogotá. */
export function formatDate(value: string): string {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-05:00`)
    : new Date(value);
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: 'America/Bogota',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

/** Tamaño de un archivo para leer. */
export function sizeLabel(bytes: number): string {
  return storageLabel(bytes / (1024 * 1024));
}
