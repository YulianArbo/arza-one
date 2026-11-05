import type { Readable } from 'node:stream';

import { StreamableFile } from '@nestjs/common';
import type { Response } from 'express';

/** Contenido de una foto o un logo listo para entregar. */
export interface ImageContent {
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly content: Readable;
}

/**
 * Entrega una foto o un logo (B22A) para mostrarlo en la página: solo PNG o JPG ya revisados por
 * el antivirus. Nunca queda en una caché compartida y el navegador la vuelve a pedir cada vez,
 * así un cambio se ve de inmediato; tampoco adivina otro tipo.
 */
export function imageResponse(response: Response, image: ImageContent): StreamableFile {
  response.setHeader('Cache-Control', 'private, no-cache');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Content-Disposition', 'inline');
  return new StreamableFile(image.content, {
    type: image.mimeType,
    length: image.sizeBytes,
  });
}
