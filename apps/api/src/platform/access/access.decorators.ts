import { SetMetadata, type CustomDecorator } from '@nestjs/common';

export const ACCESS_KEY = 'arza:access';

/** Cómo se accede a una ruta. Toda ruta debe declararlo; sin declaración queda cerrada. */
export type AccessRule = 'public' | 'authenticated';

/** Ruta abierta sin sesión, como /health. Úsela solo cuando el manual lo prevea. */
export function Public(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'public' satisfies AccessRule);
}

/** Ruta que exige una sesión válida. Los permisos por rol se agregan en B10. */
export function Authenticated(): CustomDecorator {
  return SetMetadata(ACCESS_KEY, 'authenticated' satisfies AccessRule);
}
