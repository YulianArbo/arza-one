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
  cancelHiringSchema,
  companySignerListResponseSchema,
  downloadLinkResponseSchema,
  employeeDetailResponseSchema,
  employeeListResponseSchema,
  signHiringSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import type { AppAbility } from '../../../platform/access/ability.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Hiring } from '../application/hiring.js';
import { EmployeeRecords } from '../application/employee-records.js';

class SignHiringBody extends createZodDto(signHiringSchema) {}
class CancelHiringBody extends createZodDto(cancelHiringSchema) {}
class EmployeeListResponse extends createZodDto(employeeListResponseSchema) {}
class EmployeeDetailResponse extends createZodDto(employeeDetailResponseSchema) {}
class ContractDownloadLinkResponse extends createZodDto(downloadLinkResponseSchema) {}
class CompanySignerListResponse extends createZodDto(companySignerListResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });

@ApiTags('Talento Humano')
@Controller('v1/hr/employees')
@ApiPermissionErrors()
export class EmploymentController {
  constructor(
    @Inject(Hiring) private readonly hiring: Hiring,
    @Inject(EmployeeRecords) private readonly records: EmployeeRecords,
  ) {}

  @Get('company-signers')
  @RequirePermission('hr.employee.manage')
  @ApiOperation({ summary: 'Consultar las personas de Dirección que pueden firmar' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: CompanySignerListResponse,
    description: 'Firmantes de la empresa',
  })
  async companySigners(
    @CurrentPrincipal() principal: Principal,
  ): Promise<CompanySignerListResponse> {
    return { data: await this.hiring.companySigners(principal) };
  }

  @Post(':id/actions/cancel-hiring')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.manage')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión del colaborador' })
  @ApiOperation({ summary: 'Anular una vinculación pendiente' })
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CancelHiringBody,
  ): Promise<void> {
    await this.hiring.cancel(
      principal,
      meta,
      { id, version: versionFromIfMatch(version) },
      input.reason,
    );
  }

  @Get()
  @RequirePermission('hr.employee.read')
  @ApiOperation({ summary: 'Consultar colaboradores' })
  @ZodResponse({ status: HttpStatus.OK, type: EmployeeListResponse, description: 'Colaboradores' })
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
  ): Promise<EmployeeListResponse> {
    return { data: await this.records.list({ principal, ability }) };
  }

  @Get(':id')
  @RequirePermission('hr.employee.read')
  @ApiOperation({ summary: 'Consultar la ficha del colaborador' })
  @ZodResponse({ status: HttpStatus.OK, type: EmployeeDetailResponse, description: 'Colaborador' })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<EmployeeDetailResponse> {
    return this.records.detail({ principal, ability }, id);
  }

  @Post(':id/contract/download-link')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('hr.employee.read')
  @ApiOperation({ summary: 'Obtener el enlace privado del contrato laboral' })
  @ZodResponse({
    status: HttpStatus.OK,
    type: ContractDownloadLinkResponse,
    description: 'Enlace temporal',
  })
  async download(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<ContractDownloadLinkResponse> {
    return this.records.contractLink({ principal, ability }, meta, id);
  }

  @Post(':id/actions/activate')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.manage')
  @ApiHeader({ name: 'If-Match', required: true, description: 'Versión del colaborador' })
  @ApiOperation({ summary: 'Vincular al colaborador con el contrato firmado' })
  async activate(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.hiring.activate(principal, meta, id, versionFromIfMatch(version));
  }

  @Post(':id/contract/actions/sign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.salary.read')
  @RecentAuthentication()
  @ApiOperation({ summary: 'Firmar el contrato laboral por la empresa' })
  async sign(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Body() input: SignHiringBody,
  ): Promise<void> {
    await this.hiring.sign(principal, meta, id, input.accept);
  }
}
