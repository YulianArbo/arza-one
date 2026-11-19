import { describe, expect, it } from 'vitest';

import {
  breadcrumbFor,
  canSee,
  findNavigationItem,
  hrefFor,
  isActive,
  navigationPermissions,
  parentModuleFor,
  visibleNavigation,
  type NavigationItem,
} from './navigation';

function item(slug: string): NavigationItem {
  const found = findNavigationItem(slug);
  if (!found) {
    throw new Error(`No existe el módulo ${slug}`);
  }
  return found;
}

function visibleSlugs(granted: string[]): string[] {
  return visibleNavigation(new Set(granted)).flatMap((group) =>
    group.items.map((entry) => entry.slug),
  );
}

describe('menú por permisos (permiso denegado, 16.3)', () => {
  it('sin permisos solo muestra lo que todos pueden usar', () => {
    expect(visibleSlugs([])).toEqual(['', 'sistema-de-diseno']);
  });

  it('«Mis tareas» aparece a quien atiende tareas o ve el tablero (B15)', () => {
    expect(visibleSlugs(['wf.task.work'])).toContain('mis-tareas');
    expect(visibleSlugs(['wf.task.read_all'])).toContain('mis-tareas');
    expect(visibleSlugs(['wf.definition.manage'])).toContain('administracion');
  });

  it('oculta un módulo cuando no se tiene ninguno de sus permisos', () => {
    const slugs = visibleSlugs(['crm.lead.read']);
    expect(slugs).toContain('comercial');
    expect(slugs).not.toContain('finanzas');
    expect(slugs).not.toContain('administracion');
  });

  it('basta con uno de los permisos del módulo', () => {
    expect(canSee(item('proyectos'), new Set(['project.read_member']))).toBe(true);
    expect(canSee(item('proyectos'), new Set(['contract.read']))).toBe(false);
  });

  it('un grupo sin módulos visibles no se muestra', () => {
    const groups = visibleNavigation(new Set()).map((group) => group.label);
    expect(groups).toEqual(['Inicio', 'Gobierno']);
    const onlyModules = visibleNavigation(new Set(['contract.read']));
    expect(onlyModules.every((group) => group.items.length > 0)).toBe(true);
  });

  it('con todos los permisos del menú se ven todos los módulos', () => {
    expect(visibleSlugs([...navigationPermissions()])).toHaveLength(19); // B13 agrega Terceros; B14, Archivos; B17, Privacidad; B33, Compras.
  });

  it('«Compras» aparece a quien lee el módulo o pide lo suyo (B33)', () => {
    expect(visibleSlugs(['purchase.read'])).toContain('compras');
    expect(visibleSlugs(['purchase.request.create'])).toContain('compras');
    expect(visibleSlugs(['purchase.travel.request'])).toContain('compras');
    expect(visibleSlugs(['asset.read'])).toContain('compras');
    expect(visibleSlugs(['finance.ledger.read'])).not.toContain('compras');
  });
});

describe('grupos del menú (B22B)', () => {
  it('agrupa los módulos como los bocetos de B22B, cada uno en un solo grupo', () => {
    const groups = visibleNavigation(navigationPermissions()).map((group) => ({
      label: group.label,
      slugs: group.items.map((entry) => entry.slug),
    }));
    expect(groups).toEqual([
      { label: 'Inicio', slugs: [''] },
      { label: 'Trabajo diario', slugs: ['mis-tareas'] },
      {
        label: 'Clientes y operación',
        slugs: ['terceros', 'comercial', 'contratos', 'proyectos', 'servicio'],
      },
      {
        label: 'Gestión interna',
        slugs: ['compras', 'finanzas', 'talento-y-sst', 'documentos', 'archivos'],
      },
      {
        label: 'Gobierno',
        slugs: [
          'privacidad',
          'administracion',
          'auditoria',
          'estado-del-sistema',
          'sistema-de-diseno',
        ],
      },
      { label: 'Bloques posteriores', slugs: ['calidad', 'indicadores'] },
    ]);
  });
});

describe('direcciones y ruta de navegación', () => {
  it('Inicio es /app y los módulos cuelgan de /app', () => {
    expect(hrefFor(item(''))).toBe('/app');
    expect(hrefFor(item('comercial'))).toBe('/app/comercial');
  });

  it('marca activo el módulo actual y sus páginas internas, no los de nombre parecido', () => {
    expect(isActive(item('comercial'), '/app/comercial')).toBe(true);
    expect(isActive(item('comercial'), '/app/comercial/oportunidades')).toBe(true);
    expect(isActive(item('comercial'), '/app/comercialx')).toBe(false);
    expect(isActive(item(''), '/app')).toBe(true);
    expect(isActive(item(''), '/app/comercial')).toBe(false);
  });

  it('«Volver a» lleva al módulo solo desde sus páginas internas', () => {
    expect(parentModuleFor('/app/compras/solicitudes')?.label).toBe('Compras');
    expect(parentModuleFor('/app/compras/activos/mantenimientos')?.label).toBe('Compras');
    expect(parentModuleFor('/app/compras')).toBeUndefined();
    expect(parentModuleFor('/app/compras/')).toBeUndefined();
    expect(parentModuleFor('/app')).toBeUndefined();
    expect(parentModuleFor('/app/no-existe/algo')).toBeUndefined();
  });

  it('la ruta muestra Inicio y el módulo actual', () => {
    expect(breadcrumbFor('/app').map((entry) => entry.label)).toEqual(['Inicio']);
    expect(breadcrumbFor('/app/estado-del-sistema').map((entry) => entry.label)).toEqual([
      'Inicio',
      'Estado del sistema',
    ]);
    expect(breadcrumbFor('/app/no-existe').map((entry) => entry.label)).toEqual(['Inicio']);
  });
});
