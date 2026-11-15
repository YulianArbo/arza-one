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
import { ApiHeader, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  createExpenseSchema,
  createPettyCashMovementSchema,
  errorResponseSchema,
  expenseListResponseSchema,
  financeOptionsResponseSchema,
  invoiceCreatedResponseSchema,
  pettyCashResponseSchema,
  rejectExpenseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { ExpensesUseCase } from '../application/expenses.js';
import { PettyCashUseCase } from '../application/petty-cash.js';

class ExpenseListResponse extends createZodDto(expenseListResponseSchema) {}
class FinanceOptionsResponse extends createZodDto(financeOptionsResponseSchema) {}
class PettyCashResponse extends createZodDto(pettyCashResponseSchema) {}
class CreatedResponse extends createZodDto(invoiceCreatedResponseSchema) {}
class CreateExpense extends createZodDto(createExpenseSchema) {}
class RejectExpense extends createZodDto(rejectExpenseSchema) {}
class CreatePettyCashMovement extends createZodDto(createPettyCashMovementSchema) {}
class FinErrorResponse extends createZodDto(errorResponseSchema) {}

const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', description: 'Versión del gasto', required: true };
const INVALID = {
  status: HttpStatus.UNPROCESSABLE_ENTITY,
  type: FinErrorResponse.Output,
  description: 'Datos no válidos',
};
const CLOSED = {
  status: HttpStatus.CONFLICT,
  type: FinErrorResponse.Output,
  description: 'Mes cerrado, estado o versión distinta',
};

@ApiTags('Finanzas')
@Controller('v1/finance')
@ApiPermissionErrors()
export class ExpensesController {
  constructor(
    @Inject(ExpensesUseCase) private readonly expenses: ExpensesUseCase,
    @Inject(PettyCashUseCase) private readonly pettyCash: PettyCashUseCase,
  ) {}

  @RequirePermission('finance.ledger.read')
  @Get('expenses')
  @ApiOperation({ summary: 'Gastos de la empresa' })
  @ZodResponse({ status: HttpStatus.OK, type: ExpenseListResponse, description: 'Gastos' })
  async list(@CurrentPrincipal() principal: Principal): Promise<ExpenseListResponse> {
    return { data: await this.expenses.list(principal) };
  }

  @RequirePermission('finance.expense.manage')
  @Get('expenses/mine')
  @ApiOperation({ summary: 'Gastos que registró la persona' })
  @ZodResponse({ status: HttpStatus.OK, type: ExpenseListResponse, description: 'Mis gastos' })
  async mine(@CurrentPrincipal() principal: Principal): Promise<ExpenseListResponse> {
    return { data: await this.expenses.mine(principal) };
  }

  @RequirePermission('finance.expense.manage')
  @Get('options')
  @ApiOperation({ summary: 'Centros de costo, rubros y proveedores para los formularios' })
  @ZodResponse({ status: HttpStatus.OK, type: FinanceOptionsResponse, description: 'Opciones' })
  async options(@CurrentPrincipal() principal: Principal): Promise<FinanceOptionsResponse> {
    return { data: await this.expenses.options(principal) };
  }

  @RequirePermission('finance.expense.manage')
  @Post('expenses')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar un gasto con su soporte' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Gasto' })
  @ApiResponse(INVALID)
  @ApiResponse(CLOSED)
  async create(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: CreateExpense,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return {
      id: await this.expenses.create({ principal, meta }, idempotencyKeyFrom(header), body),
    };
  }

  @RequirePermission('finance.expense.approve')
  @Post('expenses/:id/approval')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Aprobar un gasto (otra persona que quien lo registró)' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  @ApiResponse(CLOSED)
  async approve(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.expenses.approve({ principal, meta }, id, versionFromIfMatch(ifMatch));
  }

  @RequirePermission('finance.expense.approve')
  @Post('expenses/:id/rejection')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Rechazar un gasto con su motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazado' })
  @ApiResponse(CLOSED)
  async reject(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: RejectExpense,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.expenses.reject({ principal, meta }, id, versionFromIfMatch(ifMatch), body.reason);
  }

  @RequirePermission('finance.ledger.read')
  @Get('petty-cash')
  @ApiOperation({ summary: 'Libro de la caja menor con su saldo' })
  @ZodResponse({ status: HttpStatus.OK, type: PettyCashResponse, description: 'Caja menor' })
  async ledger(@CurrentPrincipal() principal: Principal): Promise<PettyCashResponse> {
    return { data: await this.pettyCash.ledger(principal) };
  }

  @RequirePermission('finance.petty_cash.manage')
  @Post('petty-cash/movements')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar apertura, vale o reembolso de la caja menor' })
  @ZodResponse({ status: HttpStatus.CREATED, type: CreatedResponse, description: 'Movimiento' })
  @ApiResponse(INVALID)
  @ApiResponse(CLOSED)
  async registerMovement(
    @CurrentPrincipal() principal: Principal,
    @Headers('idempotency-key') header: string | undefined,
    @Body() body: CreatePettyCashMovement,
    @Meta() meta: RequestMeta,
  ): Promise<CreatedResponse> {
    return {
      id: await this.pettyCash.register({ principal, meta }, idempotencyKeyFrom(header), body),
    };
  }
}
