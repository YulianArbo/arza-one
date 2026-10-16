import { Body, Controller, Get, Headers, HttpStatus, Inject, Param, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  notificationKindSchema,
  notificationTemplateListSchema,
  notificationTemplateSchema,
  updateNotificationTemplateRequestSchema,
  type NotificationKind,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { templateNotFound } from '../application/ntf-messages.js';
import { TemplatesUseCase } from '../application/templates.js';
import { ApiIfMatch, ApiNtfWriteErrors } from './ntf-openapi.js';

class TemplateListResponse extends createZodDto(notificationTemplateListSchema) {}
class TemplateResponse extends createZodDto(notificationTemplateSchema) {}
class UpdateTemplateRequest extends createZodDto(updateNotificationTemplateRequestSchema) {}

function kindOf(value: string): NotificationKind {
  const parsed = notificationKindSchema.safeParse(value);
  if (!parsed.success) throw templateNotFound();
  return parsed.data;
}

/** Plantillas institucionales de los avisos (B16): Administración › Plantillas. */
@ApiTags('Avisos')
@Controller('v1/notification-templates')
@RequirePermission('ntf.template.manage')
@ApiPermissionErrors()
export class NotificationTemplatesController {
  constructor(@Inject(TemplatesUseCase) private readonly templates: TemplatesUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Plantillas vigentes de cada tipo de aviso' })
  @ZodResponse({ status: HttpStatus.OK, type: TemplateListResponse, description: 'Plantillas' })
  async list(@CurrentPrincipal() principal: Principal): Promise<TemplateListResponse> {
    return { items: await this.templates.list(principal) };
  }

  @Patch(':kind')
  @ApiOperation({
    summary: 'Guardar una versión nueva de la plantilla',
    description:
      'Solo puede usar los datos de su tipo de aviso. La marca «urgente» la exceptúa del envío diferido.',
  })
  @ApiIfMatch()
  @ZodResponse({ status: HttpStatus.OK, type: TemplateResponse, description: 'Plantilla' })
  @ApiNtfWriteErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @Param('kind') kind: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateTemplateRequest,
    @Meta() meta: RequestMeta,
  ): Promise<TemplateResponse> {
    return this.templates.update(principal, kindOf(kind), versionFromIfMatch(ifMatch), body, meta);
  }
}
