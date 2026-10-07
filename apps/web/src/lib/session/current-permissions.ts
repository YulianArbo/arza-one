import { navigationPermissions } from '../../components/app-shell/navigation';

/**
 * Permisos del usuario actual, solo para decidir qué mostrar. La API es la única barrera.
 *
 * B10: se reemplaza por la respuesta de GET /api/v1/me/permissions. Mientras no existan el
 * inicio de sesión (B08) ni los roles (B10), la vista local concede los permisos del menú
 * para poder recorrer todas las pantallas.
 */
export function currentPermissions(): ReadonlySet<string> {
  return navigationPermissions();
}
