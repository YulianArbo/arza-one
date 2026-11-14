import { Controller, Get, HttpStatus, Inject, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  downloadLinkResponseSchema,
  portalContractListSchema,
  portalDocumentListSchema,
  portalHomeSchema,
  portalProjectDetailSchema,
  portalProjectListSchema,
  portalSignatureListSchema,
  portalSigningLinkSchema,
  type PortalDocumentKind,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { PortalActions } from '../application/portal-actions.js';
import { PortalQueries } from '../application/portal-queries.js';
import { ApiPortalErrors, ApiPortalWriteErrors, DOCUMENT_KIND, UUID } from './portal-openapi.js';

class PortalHomeResponse extends createZodDto(portalHomeSchema) {}
class PortalProjectListResponse extends createZodDto(portalProjectListSchema) {}
class PortalProjectDetailResponse extends createZodDto(portalProjectDetailSchema) {}
class PortalSignatureListResponse extends createZodDto(portalSignatureListSchema) {}
class PortalSigningLinkResponse extends createZodDto(portalSigningLinkSchema) {}
class PortalContractListResponse extends createZodDto(portalContractListSchema) {}
class PortalDocumentListResponse extends createZodDto(portalDocumentListSchema) {}
class PortalDownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}

/**
 * Portal del cliente (M09, B30; ficha 17.10): el inicio, sus proyectos, lo que espera su firma,
 * sus contratos y sus documentos. Todo limitado a la empresa cliente de la persona.
 */
@ApiTags('Portal del cliente')
@Controller('v1/portal')
@ApiPermissionErrors()
@ApiPortalErrors()
export class PortalWorkController {
  constructor(
    @Inject(PortalQueries) private readonly queries: PortalQueries,
    @Inject(PortalActions) private readonly actions: PortalActions,
  ) {}

  @RequirePermission('portal.project.read')
  @Get('home')
  @ApiOperation({
    summary: 'Inicio del cliente',
    description: 'Sus proyectos, próximos hitos y lo que espera su respuesta.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalHomeResponse, description: 'Resumen' })
  async home(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalHomeResponse> {
    return this.queries.home({ principal, ability });
  }

  @RequirePermission('portal.project.read')
  @Get('projects')
  @ApiOperation({
    summary: 'Mis proyectos',
    description: 'Los que ya iniciaron; el usuario del cliente ve los que se le asignaron.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalProjectListResponse, description: 'Proyectos' })
  async projects(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalProjectListResponse> {
    return this.queries.projects({ principal, ability });
  }

  @RequirePermission('portal.project.read')
  @Get('projects/:id')
  @ApiOperation({
    summary: 'Avance de un proyecto',
    description: 'Hitos y entregables con su acta. Sin horas, dinero ni notas del equipo.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PortalProjectDetailResponse,
    description: 'Proyecto',
  })
  async project(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<PortalProjectDetailResponse> {
    return this.queries.project({ principal, ability }, id);
  }

  @RequirePermission('portal.contract.read')
  @Get('signatures')
  @ApiOperation({
    summary: 'Por firmar y firmados',
    description: 'Contratos, otrosíes y actas de entrega de su empresa en firma o terminados.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PortalSignatureListResponse, description: 'Firmas' })
  async signatures(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalSignatureListResponse> {
    return this.queries.signatures({ principal, ability });
  }

  @RequirePermission('portal.contract.read')
  @Post('signatures/:id/link')
  @ApiOperation({
    summary: 'Firmar ahora',
    description:
      'Enlace nuevo de un solo uso a la pantalla de firma, que pide el código enviado a su correo. El enlace anterior deja de servir.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PortalSigningLinkResponse,
    description: 'Enlace',
  })
  @ApiPortalWriteErrors()
  async signingLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PortalSigningLinkResponse> {
    return this.actions.signingLink({ principal, ability, meta }, id);
  }

  @RequirePermission('portal.contract.read')
  @Get('contracts')
  @ApiOperation({
    summary: 'Contratos de su empresa',
    description: 'Desde que se envían a firma; nunca borradores.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PortalContractListResponse,
    description: 'Contratos',
  })
  async contracts(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalContractListResponse> {
    return this.queries.contracts({ principal, ability });
  }

  @RequirePermission('portal.contract.read')
  @Post('contracts/:id/link')
  @ApiOperation({
    summary: 'Descargar el contrato firmado',
    description: 'Enlace temporal; la descarga queda registrada.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PortalDownloadLinkResponse,
    description: 'Enlace',
  })
  @ApiPortalWriteErrors()
  async contractLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PortalDownloadLinkResponse> {
    return this.queries.contractLink({ principal, ability }, id, meta);
  }

  @RequirePermission('portal.project.read')
  @Get('documents')
  @ApiOperation({
    summary: 'Documentos compartidos',
    description: 'Contratos y actas firmados y los archivos que el equipo compartió.',
  })
  @ZodResponse({
    status: HttpStatus.OK,
    type: PortalDocumentListResponse,
    description: 'Documentos',
  })
  async documents(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<PortalDocumentListResponse> {
    return this.queries.documents({ principal, ability });
  }

  @RequirePermission('portal.project.read')
  @Post('documents/:kind/:id/link')
  @ApiOperation({
    summary: 'Descargar un documento',
    description: 'Enlace temporal; la descarga queda registrada.',
  })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: PortalDownloadLinkResponse,
    description: 'Enlace',
  })
  @ApiPortalWriteErrors()
  async documentLink(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('kind', DOCUMENT_KIND) kind: PortalDocumentKind,
    @Param('id', UUID) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<PortalDownloadLinkResponse> {
    return this.queries.documentLink({ principal, ability }, { kind, id }, meta);
  }
}
