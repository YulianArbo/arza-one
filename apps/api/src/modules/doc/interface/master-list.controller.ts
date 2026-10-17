import { Controller, Get, Header, HttpStatus, Inject, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import { masterListQuerySchema, masterListResponseSchema } from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { MasterListUseCase } from '../application/master-list.js';

class MasterListQuery extends createZodDto(masterListQuerySchema) {}
class MasterListResponse extends createZodDto(masterListResponseSchema) {}

/** Listado Maestro en línea (M03, B19; RE-SGC-001). */
@ApiTags('Documentos')
@Controller('v1/master-list')
@ApiPermissionErrors()
export class MasterListController {
  constructor(@Inject(MasterListUseCase) private readonly masterList: MasterListUseCase) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Consultar el Listado Maestro',
    description:
      'Documentos del SGC con código, nombre, tipo, proceso, versión, fecha, estado y responsable. Por defecto, los vigentes.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: MasterListResponse, description: 'Listado' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: MasterListQuery,
  ): Promise<MasterListResponse> {
    return this.masterList.list(principal, ability, query);
  }

  @RequirePermission('doc.export')
  @Get('export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Cache-Control', 'no-store')
  @ApiOperation({
    summary: 'Exportar el Listado Maestro a CSV',
    description:
      'Con los mismos filtros; separado por punto y coma para Excel. La exportación queda en la auditoría.',
  })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: MasterListQuery,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.masterList.export(principal, ability, query, meta);
    response.attachment(file.fileName);
    return file.content;
  }
}
