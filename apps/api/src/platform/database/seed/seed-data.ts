// Datos semilla (capítulo 12.1). Identificadores fijos para que los guiones sean idempotentes.
// Ningún dato es real (CLAUDE.md): el NIT de ARZA TECH se registra en la administración (B12).

export interface SeedTenant {
  readonly id: string;
  readonly legalName: string;
  readonly tradeName: string;
  readonly taxId: string;
}

export interface SeedOutboxEvent {
  readonly id: string;
  readonly tenantId: string;
  readonly eventType: string;
  readonly payload: Record<string, string>;
}

/** Empresa que opera la plataforma. Se crea en todos los ambientes. */
export const PLATFORM_TENANT: SeedTenant = {
  id: '01999a00-0000-7000-8000-000000000001',
  legalName: 'ARZA TECH S.A.S.',
  tradeName: 'ARZA TECH',
  taxId: '900000000-0',
};

/** Empresas ficticias para pruebas manuales y demostraciones. Nunca en producción. */
export const DEMO_TENANTS: readonly SeedTenant[] = [
  {
    id: '01999a00-0000-7000-8000-0000000000d1',
    legalName: 'Empresa Demo Uno S.A.S.',
    tradeName: 'Demo Uno',
    taxId: '900000001-1',
  },
  {
    id: '01999a00-0000-7000-8000-0000000000d2',
    legalName: 'Empresa Demo Dos S.A.S.',
    tradeName: 'Demo Dos',
    taxId: '900000002-2',
  },
];

/** Un evento ficticio por empresa de demostración, para ver la bandeja de salida con datos. */
export const DEMO_OUTBOX_EVENTS: readonly SeedOutboxEvent[] = DEMO_TENANTS.map((tenant, index) => ({
  id: `01999a00-0000-7000-8000-0000000000e${String(index + 1)}`,
  tenantId: tenant.id,
  eventType: 'demo.seeded',
  payload: { description: `Evento de demostración de ${tenant.tradeName}` },
}));
