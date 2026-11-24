import { HttpStatus, Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { PLATFORM_ERROR_CODES } from '@arza/contracts';

import { AppError } from '../errors/app-error.js';

// Ningún texto de una petición puede traer el carácter nulo (B43). PostgreSQL no lo admite en un
// texto y respondía con un error interno; el análisis de ZAP lo encontró enviando «%00». Se
// rechaza antes de validar, en el cuerpo, la consulta y la ruta, como dato inválido.

const NULL_CHARACTER = '\u0000';
const CHECKED: ReadonlySet<ArgumentMetadata['type']> = new Set(['body', 'query', 'param']);
const MAX_DEPTH = 32;

/** ¿Algún texto, nombre de campo o elemento del valor trae el carácter nulo? */
export function hasNullCharacter(value: unknown, depth = 0): boolean {
  if (typeof value === 'string') return value.includes(NULL_CHARACTER);
  if (depth > MAX_DEPTH || value === null || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some((item) => hasNullCharacter(item, depth + 1));
  return Object.entries(value).some(
    ([key, item]) => key.includes(NULL_CHARACTER) || hasNullCharacter(item, depth + 1),
  );
}

@Injectable()
export class NullCharacterPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    if (CHECKED.has(metadata.type) && hasNullCharacter(value)) {
      throw new AppError(
        HttpStatus.UNPROCESSABLE_ENTITY,
        PLATFORM_ERROR_CODES.validationFailed,
        'Los datos enviados traen caracteres no permitidos.',
      );
    }
    return value;
  }
}
