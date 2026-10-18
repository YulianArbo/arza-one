import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createFormRecordSchema,
  downloadLinkResponseSchema,
  formRecordListQuerySchema,
  formRecordListResponseSchema,
  formRecordSchema,
  formRecordStepRequestSchema,
  formRecordStepSchema,
  updateFormRecordSchema,
  type FormRecordStep,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { hasPermission, type AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { transitionNotAllowed } from '../application/doc-messages.js';
import { FormRecordsUseCase } from '../application/form-records.js';
import { ApiDocErrors, ApiIfMatch, DocCreatedResponse } from './doc-openapi.js';

class FormRecordListQuery extends createZodDto(formRecordListQuerySchema) {}
class FormRecordListResponse extends createZodDto(formRecordListResponseSchema) {}
class FormRecordResponse extends createZodDto(formRecordSchema) {}
class CreateFormRecord extends createZodDto(createFormRecordSchema) {}
class UpdateFormRecord extends createZodDto(updateFormRecordSchema) {}
class FormRecordStepRequest extends createZodDto(formRecordStepRequestSchema) {}
class DownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const UUID = new ParseUUIDPipe();

/** El paso de la ruta: enviar, aprobar o devolver; otro no está permitido. */
class StepPipe {
  transform(value: unknown): FormRecordStep {
    const parsed = formRecordStepSchema.safeParse(value);
    if (!parsed.success) throw transitionNotAllowed();
    return parsed.data;
  }
}

/** Enviar exige diligenciar formatos; aprobar y devolver, aprobarlos. */
function assertStepPermission(ability: AppAbility, step: FormRecordStep): void {
  const code = step === 'submit' ? 'doc.form_record.create' : 'doc.form_record.approve';
  if (!hasPermission(ability, code)) throw permissionDenied();
}

/**
 * Registros diligenciados (M03, B20): borrador, envío con lo obligatorio, aprobación en el motor
 * de flujos y el PDF institucional. Cada registro conserva la versión del formato con que se creó.
 */
@ApiTags('Documentos')
@Controller('v1/form-records')
@ApiPermissionErrors()
export class FormRecordsController {
  constructor(@Inject(FormRecordsUseCase) private readonly records: FormRecordsUseCase) {}

  @RequirePermission('doc.document.read')
  @Get()
  @ApiOperation({
    summary: 'Listar los registros diligenciados',
    description:
      'Quien solo ve lo propio ve los que diligenció; los confidenciales, solo quien debe.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FormRecordListResponse, description: 'Página' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: FormRecordListQuery,
  ): Promise<FormRecordListResponse> {
    return this.records.list(principal, ability, query);
  }

  @RequirePermission('doc.form_record.create')
  @Post()
  @ApiOperation({
    summary: 'Diligenciar un formato',
    description:
      'Crea el registro en borrador con la versión publicada del formato y su código FT-…-AAAA-NNNN. Lo incompleto se acepta.',
  })
  @ApiResponse({ status: HttpStatus.CREATED, type: DocCreatedResponse, description: 'Creado' })
  @ApiDocErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateFormRecord,
    @Meta() meta: RequestMeta,
  ): Promise<DocCreatedResponse> {
    return { id: await this.records.create({ principal, ability, meta }, body) };
  }

  @RequirePermission('doc.document.read')
  @Get(':id')
  @ApiOperation({
    summary: 'Ver un registro',
    description:
      'Con los campos de la versión del formato con que se creó, su paso y sus acciones.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: FormRecordResponse, description: 'Registro' })
  @ApiDocErrors()
  async get(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<FormRecordResponse> {
    return this.records.get(principal, ability, id);
  }

  @RequirePermission('doc.form_record.create')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Guardar el borrador propio',
    description: 'Fuera del borrador responde 409.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateFormRecord,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.records.update({ principal, ability, meta }, target, body);
  }

  @RequirePermission('doc.document.read')
  @Post(':id/actions/:step')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiParam({ name: 'step', enum: formRecordStepSchema.options })
  @ApiOperation({
    summary: 'Enviar, aprobar o devolver un registro',
    description:
      'Enviar exige lo obligatorio; sin flujo, el registro termina. Aprobar y devolver (con motivo) los da quien atiende la aprobación; quien lo diligenció no.',
  })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Hecho' })
  @ApiDocErrors()
  async step(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Param('step', StepPipe) step: FormRecordStep,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: FormRecordStepRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    assertStepPermission(ability, step);
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.records.step({ principal, ability, meta }, target, step, body);
  }

  @RequirePermission('doc.document.read')
  @Post(':id/pdf')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pedir el enlace de descarga del PDF',
    description:
      'Del registro terminado. Recalcula la huella del archivo; si no coincide responde 409.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadLinkResponse, description: 'Enlace' })
  @ApiDocErrors()
  async pdf(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.records.pdfLink(principal, ability, id, meta);
  }
}
