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
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  competitorListResponseSchema,
  innCreatedResponseSchema,
  innRefListResponseSchema,
  releaseRoadmapItemSchema,
  roadmapListResponseSchema,
  roadmapReleaseResponseSchema,
  saveCompetitorSchema,
  saveRoadmapItemSchema,
  saveWatchEntrySchema,
  watchListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Roadmap } from '../application/roadmap.js';
import { Competitors, TechWatch } from '../application/watch.js';

class InnRoadmapListResponse extends createZodDto(roadmapListResponseSchema) {}
class InnRoadmapItemBody extends createZodDto(saveRoadmapItemSchema) {}
class InnRoadmapReleaseBody extends createZodDto(releaseRoadmapItemSchema) {}
class InnRoadmapReleaseResponse extends createZodDto(roadmapReleaseResponseSchema) {}
class InnWatchListResponse extends createZodDto(watchListResponseSchema) {}
class InnWatchBody extends createZodDto(saveWatchEntrySchema) {}
class InnCompetitorListResponse extends createZodDto(competitorListResponseSchema) {}
class InnCompetitorBody extends createZodDto(saveCompetitorSchema) {}
class InnPeopleResponse extends createZodDto(innRefListResponseSchema) {}
class InnCreatedResponse extends createZodDto(innCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del registro' };

// Hoja de ruta de productos propios (FT-INN-004), vigilancia tecnológica (FT-INN-006) y análisis
// de competencia (RE-INN-002) (B40, ficha 17.16).

@ApiTags('Innovación')
@Controller('v1/innovation')
@ApiPermissionErrors()
export class RoadmapWatchController {
  constructor(
    @Inject(Roadmap) private readonly roadmap: Roadmap,
    @Inject(TechWatch) private readonly watch: TechWatch,
    @Inject(Competitors) private readonly competitors: Competitors,
  ) {}

  @Get('people')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Cuentas internas activas, para elegir responsables' })
  @ZodResponse({ status: HttpStatus.OK, type: InnPeopleResponse, description: 'Personas' })
  async people(@CurrentPrincipal() principal: Principal): Promise<InnPeopleResponse> {
    return { data: await this.roadmap.people(principal) };
  }

  @Get('roadmap')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Consultar la hoja de ruta por trimestre y producto' })
  @ZodResponse({ status: HttpStatus.OK, type: InnRoadmapListResponse, description: 'Hitos' })
  async listRoadmap(@CurrentPrincipal() principal: Principal): Promise<InnRoadmapListResponse> {
    return this.roadmap.list(principal);
  }

  @Post('roadmap')
  @RequirePermission('inn.roadmap.manage')
  @ApiOperation({ summary: 'Agregar un hito a la hoja de ruta' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InnCreatedResponse, description: 'Agregado' })
  async createItem(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: InnRoadmapItemBody,
  ): Promise<InnCreatedResponse> {
    return { id: await this.roadmap.create(principal, meta, input) };
  }

  @Patch('roadmap/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.roadmap.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un hito que no se ha liberado' })
  async updateItem(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnRoadmapItemBody,
  ): Promise<void> {
    await this.roadmap.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post('roadmap/:id/release')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('inn.roadmap.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({
    summary: 'Liberar una versión; propone su registro ante Derecho de Autor y crea la tarea',
  })
  @ZodResponse({ status: HttpStatus.OK, type: InnRoadmapReleaseResponse, description: 'Liberado' })
  async release(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnRoadmapReleaseBody,
  ): Promise<InnRoadmapReleaseResponse> {
    const target = { id, version: versionFromIfMatch(version) };
    return this.roadmap.release(principal, meta, target, input);
  }

  @Get('watch')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Consultar la vigilancia tecnológica' })
  @ZodResponse({ status: HttpStatus.OK, type: InnWatchListResponse, description: 'Hallazgos' })
  async listWatch(@CurrentPrincipal() principal: Principal): Promise<InnWatchListResponse> {
    return { data: await this.watch.list(principal) };
  }

  @Post('watch')
  @RequirePermission('inn.watch.manage')
  @ApiOperation({ summary: 'Registrar un hallazgo de vigilancia tecnológica' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InnCreatedResponse, description: 'Registrado' })
  async createWatch(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: InnWatchBody,
  ): Promise<InnCreatedResponse> {
    return { id: await this.watch.create(principal, meta, input) };
  }

  @Patch('watch/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.watch.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar un hallazgo de vigilancia tecnológica' })
  async updateWatch(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnWatchBody,
  ): Promise<void> {
    await this.watch.update(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Get('competitors')
  @RequirePermission('inn.read')
  @ApiOperation({ summary: 'Consultar el análisis de competencia (RE-INN-002)' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: InnCompetitorListResponse,
    description: 'Competidores',
  })
  async listCompetitors(
    @CurrentPrincipal() principal: Principal,
  ): Promise<InnCompetitorListResponse> {
    return { data: await this.competitors.list(principal) };
  }

  @Post('competitors')
  @RequirePermission('inn.watch.manage')
  @ApiOperation({ summary: 'Registrar un competidor' })
  @ZodResponse({ status: HttpStatus.CREATED, type: InnCreatedResponse, description: 'Registrado' })
  async createCompetitor(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Body() input: InnCompetitorBody,
  ): Promise<InnCreatedResponse> {
    return { id: await this.competitors.create(principal, meta, input) };
  }

  @Patch('competitors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('inn.watch.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Actualizar el análisis de un competidor' })
  async updateCompetitor(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: InnCompetitorBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.competitors.update(principal, meta, target, input);
  }
}
