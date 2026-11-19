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
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  citeDisciplinarySchema,
  decideDisciplinarySchema,
  disciplinaryCaseSchema,
  disciplinaryListResponseSchema,
  hrCreatedResponseSchema,
  openDisciplinarySchema,
  recordHearingSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { DisciplinaryCases } from '../application/disciplinary-cases.js';

class CaseListResponse extends createZodDto(disciplinaryListResponseSchema) {}
class CaseResponse extends createZodDto(disciplinaryCaseSchema) {}
class OpenCaseBody extends createZodDto(openDisciplinarySchema) {}
class CiteBody extends createZodDto(citeDisciplinarySchema) {}
class HearingBody extends createZodDto(recordHearingSchema) {}
class DecideBody extends createZodDto(decideDisciplinarySchema) {}
class CaseCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del caso' };

// Proceso disciplinario (B36, decisión 8). Información restringida: solo Talento humano, y cada
// consulta del caso completo queda en la auditoría. Los pasos van en orden (debido proceso).

@ApiTags('Talento Humano')
@Controller('v1/hr/disciplinary-cases')
@ApiPermissionErrors()
@RequirePermission('hr.disciplinary.manage')
export class DisciplineController {
  constructor(@Inject(DisciplinaryCases) private readonly cases: DisciplinaryCases) {}

  @Get()
  @ApiOperation({ summary: 'Consultar los procesos disciplinarios (sin el contenido)' })
  @ZodResponse({ status: HttpStatus.OK, type: CaseListResponse, description: 'Procesos' })
  async list(@CurrentPrincipal() principal: Principal): Promise<CaseListResponse> {
    return { data: await this.cases.list(principal) };
  }

  @Post()
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Abrir un proceso disciplinario con los hechos' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CaseCreatedResponse, description: 'Abierto' })
  async open(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: OpenCaseBody,
  ): Promise<CaseCreatedResponse> {
    return { id: await this.cases.open(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Consultar el caso completo; la consulta queda registrada' })
  @ZodResponse({ status: HttpStatus.OK, type: CaseResponse, description: 'Caso' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<CaseResponse> {
    return this.cases.detail(principal, meta, id);
  }

  @Post(':id/actions/cite')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Citar a descargos' })
  async cite(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CiteBody,
  ): Promise<void> {
    await this.cases.cite(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/hearing')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar los descargos con el acta firmada' })
  async hearing(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: HearingBody,
  ): Promise<void> {
    await this.cases.hearing(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }

  @Post(':id/actions/decide')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Registrar la decisión motivada' })
  async decide(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: DecideBody,
  ): Promise<void> {
    await this.cases.decide(principal, meta, { id, version: versionFromIfMatch(version) }, input);
  }
}
