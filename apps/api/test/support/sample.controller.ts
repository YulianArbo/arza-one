import { Body, Controller, Get, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import { Authenticated, Public } from '../../src/platform/access/access.decorators.js';

export const INTERNAL_DETAIL = 'detalle interno que nunca debe salir';

const sampleBodySchema = z.object({
  name: z.string().min(2),
  amount: z.string().regex(/^\d+\.\d{2}$/),
});

class SampleBodyDto extends createZodDto(sampleBodySchema) {}

/** Rutas de ensayo que solo existen en las pruebas para ejercitar la cadena de petición. */
@Controller('test')
export class SampleController {
  @Public()
  @Get('boom')
  boom(): never {
    throw new Error(INTERNAL_DETAIL);
  }

  @Public()
  @Post('echo')
  echo(@Body() body: SampleBodyDto): SampleBodyDto {
    return body;
  }

  @Authenticated()
  @Get('private')
  privateResource(): string {
    return 'nunca debe llegar aquí sin sesión';
  }

  @Get('undeclared')
  undeclared(): string {
    return 'nunca debe llegar aquí: la ruta no declara su acceso';
  }
}
