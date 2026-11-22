import { Controller, Get, HttpStatus, Inject } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  nonconformityListResponseSchema,
  qmsActionListResponseSchema,
  qmsRefListResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { Actions } from '../application/actions.js';
import { Nonconformities } from '../application/nonconformities.js';

class QmsMyNonconformitiesResponse extends createZodDto(nonconformityListResponseSchema) {}
class QmsMyActionsResponse extends createZodDto(qmsActionListResponseSchema) {}
class QmsPeopleResponse extends createZodDto(qmsRefListResponseSchema) {}

// Lo de Calidad que cada persona ve en Mi espacio (B38, decisión 3): las no conformidades que
// reportó y las acciones a su cargo.

@ApiTags('Calidad')
@Controller('v1/qms')
@ApiPermissionErrors()
export class MyQualityController {
  constructor(
    @Inject(Nonconformities) private readonly nonconformities: Nonconformities,
    @Inject(Actions) private readonly actions: Actions,
  ) {}

  @Get('my/nonconformities')
  @RequirePermission('qms.nonconformity.create')
  @ApiOperation({ summary: 'Las no conformidades que reporté' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsMyNonconformitiesResponse, description: 'Lista' })
  async myNonconformities(
    @CurrentPrincipal() principal: Principal,
  ): Promise<QmsMyNonconformitiesResponse> {
    return { data: await this.nonconformities.mine(principal) };
  }

  @Get('my/actions')
  @RequirePermission('qms.action.manage')
  @ApiOperation({ summary: 'Las acciones a mi cargo' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsMyActionsResponse, description: 'Lista' })
  async myActions(@CurrentPrincipal() principal: Principal): Promise<QmsMyActionsResponse> {
    return { data: await this.actions.mine(principal) };
  }

  @Get('people')
  @RequirePermission('qms.read')
  @ApiOperation({ summary: 'Cuentas internas activas, para elegir responsables' })
  @ZodResponse({ status: HttpStatus.OK, type: QmsPeopleResponse, description: 'Personas' })
  async people(@CurrentPrincipal() principal: Principal): Promise<QmsPeopleResponse> {
    return { data: await this.actions.people(principal) };
  }
}
