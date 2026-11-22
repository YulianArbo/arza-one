import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiProduces, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  addIpAuthorSchema,
  downloadLinkResponseSchema,
  innCodeResponseSchema,
  innCreatedResponseSchema,
  ipAssetDetailSchema,
  ipAssetListResponseSchema,
  saveIpAssetSchema,
} from '@arza/contracts';
import type { Response } from 'express';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { InnFiles } from '../application/inn-files.js';
import { IpAssets } from '../application/ip-assets.js';
import { IpAuthors } from '../application/ip-authors.js';

class InnIpAssetListResponse extends createZodDto(ipAssetListResponseSchema) {}
class InnIpAssetDetailResponse extends createZodDto(ipAssetDetailSchema) {}
class InnIpAssetBody extends createZodDto(saveIpAssetSchema) {}
class InnIpAuthorBody extends createZodDto(addIpAuthorSchema) {}
class InnIpAssetCodeResponse extends createZodDto(innCodeResponseSchema) {}
class InnIpAuthorCreatedResponse extends createZodDto(innCreatedResponseSchema) {}
class InnCertificateLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Portafolio de propiedad intelectual (RE-INN-001) con su cadena de titularidad (B40).

@ApiTags('Innovación')
@Controller('v1/innovation/ip-assets')
@ApiPermissionErrors()
export class PortfolioController {
  constructor(
    @Inject(IpAssets) private readonly assets: IpAssets,
    @Inject(IpAuthors) private readonly authors: IpAuthors,
    @Inject(InnFiles) private readonly files: InnFiles,
  ) {}

  @Get()
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Consultar el portafolio de propiedad intelectual (RE-INN-001)' })
  @ZodResponse({ status: HttpStatus.OK, type: InnIpAssetListResponse, description: 'Portafolio' })
  async list(@CurrentPrincipal() principal: Principal): Promise<InnIpAssetListResponse> {
    return { data: await this.assets.list(principal) };
  }

  @Post('export')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Descargar el portafolio RE-INN-001 (CSV)' })
  @ApiProduces('text/csv')
  @ApiResponse({ status: HttpStatus.OK, description: 'Archivo CSV en UTF-8' })
  async export(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) response: Response,
  ): Promise<string> {
    const file = await this.files.portfolio(principal, meta);
    // El tipo se fija aquí y no en la ruta: un error debe seguir respondiendo JSON.
    response.type('text/csv; charset=utf-8');
    response.attachment(file.fileName);
    return file.content;
  }

  @Get(':id')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Un activo con su cadena de titularidad' })
  @ZodResponse({ status: HttpStatus.OK, type: InnIpAssetDetailResponse, description: 'Activo' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<InnIpAssetDetailResponse> {
    return this.assets.detail(principal, id);
  }

  @Post()
  @RequirePermission('inn.ip.manage')
  @ApiOperation({ summary: 'Registrar una marca, un registro de software o un dominio' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InnIpAssetCodeResponse, description: 'Hecho' })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: InnIpAssetBody,
  ): Promise<InnIpAssetCodeResponse> {
    return this.assets.create(principal, meta, input);
  }

  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.ip.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un activo: estado, número, fechas o renovación' })
  async update(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnIpAssetBody,
  ): Promise<void> {
    await this.assets.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/authors')
  @RequirePermission('inn.ip.manage')
  @ApiOperation({ summary: 'Agregar un autor con el soporte de su cesión' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: InnIpAuthorCreatedResponse,
    description: 'Agregado',
  })
  async addAuthor(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: InnIpAuthorBody,
  ): Promise<InnIpAuthorCreatedResponse> {
    return { id: await this.authors.add({ principal, ability }, meta, id, input) };
  }

  @Delete(':id/authors/:authorId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.ip.manage')
  @ApiOperation({ summary: 'Quitar un autor de la cadena de titularidad' })
  async removeAuthor(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Param('authorId', UUID) authorId: string,
  ): Promise<void> {
    await this.authors.remove(principal, meta, { assetId: id, authorId });
  }

  @Post(':id/certificate/download-link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Pedir el enlace del certificado del activo' })
  @ZodResponse({ status: HttpStatus.OK, type: InnCertificateLinkResponse, description: 'Enlace' })
  async certificateLink(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<InnCertificateLinkResponse> {
    return this.files.certificateLink(principal, id, meta);
  }
}
