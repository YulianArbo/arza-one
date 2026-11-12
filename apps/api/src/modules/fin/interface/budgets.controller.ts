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
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  budgetDetailEnvelopeSchema,
  budgetExecutionEnvelopeSchema,
  budgetListResponseSchema,
  createBudgetSchema,
  errorResponseSchema,
  invoiceCreatedResponseSchema,
  replaceBudgetLinesSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { BudgetsUseCase } from '../application/budgets.js';

class BudgetListResponse extends createZodDto(budgetListResponseSchema) {}
class BudgetDetailResponse extends createZodDto(budgetDetailEnvelopeSchema) {}
class BudgetExecutionResponse extends createZodDto(budgetExecutionEnvelopeSchema) {}
class CreatedResponse extends createZodDto(invoiceCreatedResponseSchema) {}
class CreateBudget extends createZodDto(createBudgetSchema) {}
class ReplaceBudgetLines extends createZodDto(replaceBudgetLinesSchema) {}
class FinErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', description: 'Versión del presupuesto', required: true };

@ApiTags('Finanzas')
@Controller('v1/finance/budgets')
@ApiPermissionErrors()
export class BudgetsController {
  constructor(@Inject(BudgetsUseCase) private readonly budgets: BudgetsUseCase) {}

  @RequirePermission('finance.budget.read')
  @Get()
  @ApiOperation({ summary: 'Presupuestos por año' })
  @ZodResponse({ status: HttpStatus.OK, type: BudgetListResponse, description: 'Presupuestos' })
  async list(@CurrentPrincipal() principal: Principal): Promise<BudgetListResponse> {
    return { data: await this.budgets.list(principal) };
  }

  @RequirePermission('finance.budget.read')
  @Get(':id')
  @ApiOperation({ summary: 'Detalle de un presupuesto con sus líneas' })
  @ZodResponse({ status: HttpStatus.OK, type: BudgetDetailResponse, description: 'Presupuesto' })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: FinErrorResponse.Output,
    description: 'No existe',
  })
  async detail(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<BudgetDetailResponse> {
    return { data: await this.budgets.detail(principal, id) };
  }

  @RequirePermission('finance.budget.read')
  @Get(':id/execution')
  @ApiOperation({ summary: 'Ejecución contra lo planeado por centro de costo y rubro' })
  @ZodResponse({ status: HttpStatus.OK, type: BudgetExecutionResponse, description: 'Ejecución' })
  async execution(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<BudgetExecutionResponse> {
    return { data: await this.budgets.execution(principal, id) };
  }

  @RequirePermission('finance.budget.manage')
  @Post()
  @ApiOperation({ summary: 'Crear el presupuesto de un año, en borrador' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Presupuesto' })
  @ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: FinErrorResponse.Output,
    description: 'Ya existe el de ese año',
  })
  async create(
    @CurrentPrincipal() principal: Principal,
    @Body() body: CreateBudget,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return { id: await this.budgets.create({ principal, meta }, body.year) };
  }

  @RequirePermission('finance.budget.manage')
  @Put(':id/lines')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Reemplazar las líneas de un presupuesto en borrador' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Líneas guardadas' })
  async replaceLines(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: ReplaceBudgetLines,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.budgets.replaceLines({ principal, meta }, id, versionFromIfMatch(ifMatch), body);
  }

  @RequirePermission('finance.budget.approve')
  @Post(':id/approval')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar un presupuesto (otra persona que quien lo elaboró)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.budgets.approve({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }
}
