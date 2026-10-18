import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  downloadLinkResponseSchema,
  obsoleteVersionRequestSchema,
  publishVersionRequestSchema,
  rejectVersionRequestSchema,
  updateVersionRequestSchema,
  versionDownloadRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { VersionActionsUseCase } from '../application/version-actions.js';
import { VersionDownloadsUseCase } from '../application/version-downloads.js';
import { VersionsUseCase } from '../application/versions.js';
import { ApiDocErrors, ApiIfMatch } from './doc-openapi.js';

class UpdateVersionRequest extends createZodDto(updateVersionRequestSchema) {}
class RejectVersionRequest extends createZodDto(rejectVersionRequestSchema) {}
class PublishVersionRequest extends createZodDto(publishVersionRequestSchema) {}
class ObsoleteVersionRequest extends createZodDto(obsoleteVersionRequestSchema) {}
class VersionDownloadRequest extends createZodDto(versionDownloadRequestSchema) {}
class DownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

const UUID = new ParseUUIDPipe();
const DONE = { status: HttpStatus.NO_CONTENT, description: 'Hecho' };

/**
 * Versiones (M03, B18): editar el borrador, sus pasos (enviar, devolver, aprobar, publicar y
 * declarar obsoleta) y el enlace de descarga con verificación de la huella.
 */
@ApiTags('Documentos')
@Controller('v1/versions')
@ApiPermissionErrors()
export class VersionsController {
  constructor(
    @Inject(VersionsUseCase) private readonly versions: VersionsUseCase,
    @Inject(VersionActionsUseCase) private readonly actions: VersionActionsUseCase,
    @Inject(VersionDownloadsUseCase) private readonly downloads: VersionDownloadsUseCase,
  ) {}

  @RequirePermission('doc.document.update')
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Corregir el borrador propio',
    description: 'Fuera del borrador, o si lo elaboró otra persona, responde 409.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async update(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.versions.update(principal, ability, target, body, meta);
  }

  @RequirePermission('doc.version.submit')
  @Post(':id/actions/submit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Enviar el borrador propio a revisión',
    description:
      'Con su PDF listo. Es el primer paso de su trámite: la revisión le llega a Calidad.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async submit(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.submit(
      principal,
      ability,
      { id, version: versionFromIfMatch(ifMatch) },
      meta,
    );
  }

  @RequirePermission('doc.version.review')
  @Post(':id/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Devolver la versión al borrador',
    description:
      'Con el motivo. Decide la tarea de revisión o de aprobación que la persona atiende en el trámite. Quien la elaboró no puede devolverla.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async reject(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.actions.reject(principal, ability, target, body, meta);
  }

  @RequirePermission('doc.version.approve')
  @Post(':id/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar la revisión o la versión',
    description:
      'Decide la tarea que la persona atiende en el trámite: la revisión de Calidad o la aprobación de Dirección. Quien la elaboró no la aprueba.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async approve(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.actions.approve(
      principal,
      ability,
      { id, version: versionFromIfMatch(ifMatch) },
      meta,
    );
  }

  @RequirePermission('doc.version.publish')
  @Post(':id/actions/publish')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Publicar la versión aprobada',
    description:
      'Quien atiende la publicación del trámite. Queda vigente, la anterior pasa a obsoleta (nunca hay dos vigentes) y se pide la lectura a los cargos destinatarios.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async publish(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: PublishVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.actions.publish(principal, ability, target, body, meta);
  }

  @RequirePermission('doc.version.obsolete')
  @Post(':id/actions/obsolete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Declarar obsoleta la versión vigente',
    description:
      'El documento deja de regir; los usuarios ya no la descargan. En un documento del SGC exige una solicitud de eliminación aprobada.',
  })
  @ApiIfMatch()
  @ApiResponse(DONE)
  @ApiDocErrors()
  async obsolete(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ObsoleteVersionRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(ifMatch) };
    await this.actions.obsolete(principal, ability, target, body, meta);
  }

  @RequirePermission('doc.document.read')
  @Post(':id/download-link')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pedir el enlace de descarga del PDF o del archivo fuente',
    description:
      'Recalcula la huella del archivo guardado; si no coincide responde 409 y deja una alerta. El fuente solo para quien edita documentos.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: DownloadLinkResponse, description: 'Enlace' })
  @ApiDocErrors()
  async downloadLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Body() body: VersionDownloadRequest,
    @Meta() meta: RequestMeta,
  ): Promise<DownloadLinkResponse> {
    return this.downloads.issueLink(principal, ability, id, body, meta);
  }
}
