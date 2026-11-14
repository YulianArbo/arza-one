import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { draftPqrsfRequestSchema, returnPqrsfRequestSchema } from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PqrsfStepsUseCase } from '../application/pqrsf-steps.js';
import { ApiServiceIfMatch, ApiServiceWriteErrors, UUID } from './service-openapi.js';

class DraftPqrsfRequest extends createZodDto(draftPqrsfRequestSchema) {}
class ReturnPqrsfRequest extends createZodDto(returnPqrsfRequestSchema) {}

/**
 * La respuesta de la PQRSF (M08, B29; ficha 17.9): redactarla, enviarla a aprobación, aprobarla o
 * devolverla (nunca quien la redactó) y cerrar la PQRSF ya respondida.
 */
@ApiTags('Servicio')
@Controller('v1/pqrsf/:id/actions')
@ApiPermissionErrors()
export class PqrsfResponseController {
  constructor(@Inject(PqrsfStepsUseCase) private readonly steps: PqrsfStepsUseCase) {}

  @RequirePermission('service.pqrsf.respond')
  @Post('draft')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Redactar la respuesta',
    description: 'Guarda el borrador; en una queja o un reclamo, si es procedente.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardada' })
  @ApiServiceWriteErrors()
  async draft(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: DraftPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.draft(principal, { id, version: versionFromIfMatch(ifMatch) }, body, meta);
  }

  @RequirePermission('service.pqrsf.respond')
  @Post('respond')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Enviar a aprobación', description: 'La respuesta queda por aprobar.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Enviada a aprobación' })
  @ApiServiceWriteErrors()
  async respond(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.submit(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('service.pqrsf.approve')
  @Post('approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar la respuesta',
    description:
      'Nunca quien la redactó. Sale por correo; si es una queja o un reclamo procedente, pide la no conformidad a Calidad.',
  })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Respondida' })
  @ApiServiceWriteErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.approve(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }

  @RequirePermission('service.pqrsf.approve')
  @Post('return')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Devolver la respuesta', description: 'Con lo que hay que corregir.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Devuelta' })
  @ApiServiceWriteErrors()
  async returnDraft(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReturnPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.steps.returnDraft(principal, target, body, meta);
  }

  @RequirePermission('service.pqrsf.classify')
  @Post('close')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cerrar', description: 'Una PQRSF ya respondida.' })
  @ApiServiceIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Cerrada' })
  @ApiServiceWriteErrors()
  async close(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.steps.close(principal, { id, version: versionFromIfMatch(ifMatch) }, meta);
  }
}
