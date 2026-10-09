import { describe, expect, it } from 'vitest';

import {
  homeFor,
  loginNoticeOf,
  loginPath,
  safeReturnPath,
  secondFactorPath,
} from './access-routes';

describe('a dónde va cada persona', () => {
  it('la aplicación interna o el portal según el tipo de cuenta', () => {
    expect(homeFor('internal')).toBe('/app');
    expect(homeFor('portal')).toBe('/portal');
  });

  it('vuelve a la pantalla de donde venía, solo dentro de su superficie', () => {
    expect(safeReturnPath('/app/perfil', 'internal')).toBe('/app/perfil');
    expect(safeReturnPath('/app', 'internal')).toBe('/app');
    expect(safeReturnPath('/portal/facturas', 'portal')).toBe('/portal/facturas');
  });

  it('nunca lleva a otro sitio ni a la superficie ajena', () => {
    for (const candidate of [null, '//sitio-ajeno.test', 'https://sitio-ajeno.test', '/app\\x']) {
      expect(safeReturnPath(candidate, 'internal')).toBe('/app');
    }
    expect(safeReturnPath('/application', 'internal')).toBe('/app');
    expect(safeReturnPath('/app/perfil', 'portal')).toBe('/portal');
  });
});

describe('dirección de inicio de sesión', () => {
  it('lleva el motivo y la pantalla a la que se vuelve', () => {
    expect(loginPath()).toBe('/iniciar-sesion');
    expect(loginPath('sesion-cerrada')).toBe('/iniciar-sesion?motivo=sesion-cerrada');
    expect(loginPath(undefined, '/app/perfil')).toBe('/iniciar-sesion?volver=%2Fapp%2Fperfil');
  });

  it('solo muestra avisos conocidos', () => {
    expect(loginNoticeOf('cuenta-activada')).toContain('Su cuenta quedó activa');
    expect(loginNoticeOf('inventado')).toBeNull();
    expect(loginNoticeOf('toString')).toBeNull();
    expect(loginNoticeOf(null)).toBeNull();
  });
});

describe('pantalla del segundo paso (B09)', () => {
  it('lleva a escribir el código o a configurarlo, con la pantalla a la que se vuelve', () => {
    expect(secondFactorPath('second_factor')).toBe('/segundo-factor');
    expect(secondFactorPath('second_factor_setup', null)).toBe('/segundo-factor/configurar');
    expect(secondFactorPath('second_factor', '/app/perfil')).toBe(
      '/segundo-factor?volver=%2Fapp%2Fperfil',
    );
  });
});
