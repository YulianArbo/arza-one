import { Body, Controller, Get, HttpStatus, Post } from '@nestjs/common';
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

import {
  Authenticated,
  Public,
  RecentAuthentication,
  SigningIn,
} from '../../src/platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../src/platform/access/principal.js';
import { AppError } from '../../src/platform/errors/app-error.js';
import { Meta, type RequestMeta } from '../../src/platform/http/request-meta.js';

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

  @Public()
  @Get('slow-down')
  slowDown(): never {
    throw new AppError(HttpStatus.TOO_MANY_REQUESTS, 'LOGIN_DELAYED', 'Espere 3 segundos.', 3);
  }

  @Authenticated()
  @Get('whoami')
  whoami(@CurrentPrincipal() principal: Principal, @Meta() meta: RequestMeta): object {
    return { userId: principal.userId, ip: meta.ip, userAgent: meta.userAgent };
  }

  @Authenticated()
  @Post('private-change')
  privateChange(@CurrentPrincipal() principal: Principal): object {
    return { userId: principal.userId };
  }

  @SigningIn()
  @Get('signing-in')
  signingIn(@CurrentPrincipal() principal: Principal): object {
    return { signInComplete: principal.signInComplete };
  }

  @Authenticated()
  @RecentAuthentication()
  @Get('high-risk')
  highRisk(): string {
    return 'acción de alto riesgo';
  }

  @Public()
  @Get('misused-principal')
  misusedPrincipal(@CurrentPrincipal() principal: Principal): string {
    return principal.userId;
  }

  @Get('undeclared')
  undeclared(): string {
    return 'nunca debe llegar aquí: la ruta no declara su acceso';
  }
}
