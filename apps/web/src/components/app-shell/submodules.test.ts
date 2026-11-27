import { describe, expect, it } from 'vitest';

import { breadcrumbFor } from './navigation';
import { currentSubmodule, inVisibleSubmodule, visibleSubmodules } from './submodules';

/** Conjunto que concede cualquier permiso: deja ver todos los submódulos. */
class EveryPermission extends Set<string> {
  override has(): boolean {
    return true;
  }
}
const EVERYTHING: ReadonlySet<string> = new EveryPermission();

function labels(slug: string, granted: string[]): string[] {
  return visibleSubmodules(slug, new Set(granted)).map((entry) => entry.label);
}

describe('submódulos por permiso (B22B)', () => {
  it('muestra solo los submódulos que la persona puede abrir', () => {
    expect(labels('compras', ['purchase.travel.request'])).toEqual(['Viajes']);
    expect(labels('compras', ['asset.read'])).toEqual(['Activos', 'Mantenimientos']);
    expect(labels('comercial', ['crm.lead.read'])).toEqual([
      'Prospectos',
      'Actividades',
      'Campañas',
    ]);
  });

  it('sin permisos, o en un módulo sin submódulos, no muestra ninguno', () => {
    expect(labels('compras', [])).toEqual([]);
    expect(labels('contratos', ['contract.read'])).toEqual([]);
  });

  it('cada submódulo pide al menos un permiso y su dirección es única', () => {
    const slugs = [
      'comercial',
      'servicio',
      'compras',
      'documentos',
      'finanzas',
      'privacidad',
      'administracion',
      'auditoria',
    ];
    const all = slugs.flatMap((slug) => visibleSubmodules(slug, EVERYTHING));
    expect(all.every((entry) => entry.anyOf.length > 0)).toBe(true);
    expect(new Set(all.map((entry) => entry.href)).size).toBe(all.length);
    expect(all).toHaveLength(59);
  });
});

describe('submódulo actual y ruta de tres niveles (B22B)', () => {
  it('elige el submódulo de dirección más larga', () => {
    expect(currentSubmodule('compras', '/app/compras/activos/mantenimientos')?.label).toBe(
      'Mantenimientos',
    );
    expect(currentSubmodule('compras', '/app/compras/activos/123')?.label).toBe('Activos');
    expect(currentSubmodule('compras', '/app/compras')).toBeUndefined();
    expect(currentSubmodule('comercial', '/app/comercial/oportunidades/9')?.label).toBe('Embudo');
    expect(currentSubmodule('contratos', '/app/contratos/1')).toBeUndefined();
  });

  it('la ruta suma el submódulo, salvo cuando es la portada del módulo', () => {
    expect(breadcrumbFor('/app/compras/solicitudes/7')).toEqual([
      { href: '/app', label: 'Inicio' },
      { href: '/app/compras', label: 'Compras' },
      { href: '/app/compras/solicitudes', label: 'Solicitudes' },
    ]);
    expect(breadcrumbFor('/app/comercial').map((crumb) => crumb.label)).toEqual([
      'Inicio',
      'Comercial',
    ]);
    expect(breadcrumbFor('/app/contratos/1').map((crumb) => crumb.label)).toEqual([
      'Inicio',
      'Contratos',
    ]);
  });
});

describe('submódulo visible (B22B)', () => {
  it('solo cuenta el submódulo actual si la persona lo ve', () => {
    const buyer = new Set(['purchase.read']);
    expect(inVisibleSubmodule('compras', '/app/compras/ordenes/3', buyer)).toBe(true);
    expect(inVisibleSubmodule('compras', '/app/compras/activos', buyer)).toBe(false);
    expect(inVisibleSubmodule('compras', '/app/compras', buyer)).toBe(false);
  });
});

describe('submódulos que piden toda la empresa (B22B)', () => {
  it('quien solo ve sus propios tiquetes no ve Garantías, Acuerdos ni Encuestas', () => {
    const own = new Set(['service.ticket.read']);
    const ownLabels = visibleSubmodules('servicio', own, new Set()).map((entry) => entry.label);
    expect(ownLabels).toEqual(['Tiquetes']);
    const allLabels = visibleSubmodules('servicio', own, own).map((entry) => entry.label);
    expect(allLabels).toEqual(['Tiquetes', 'Garantías', 'Acuerdos', 'Encuestas y NPS']);
  });
});
