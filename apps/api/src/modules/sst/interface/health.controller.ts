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
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  medicalExamListResponseSchema,
  medicalExamSchema,
  ppeDeliveryListResponseSchema,
  recordMedicalExamSchema,
  recordPpeDeliverySchema,
  sstCreatedResponseSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { MedicalExams } from '../application/medical-exams.js';
import { PpeDeliveries } from '../application/ppe.js';

class SstExamListResponse extends createZodDto(medicalExamListResponseSchema) {}
class SstExamResponse extends createZodDto(medicalExamSchema) {}
class SstExamBody extends createZodDto(recordMedicalExamSchema) {}
class SstPpeListResponse extends createZodDto(ppeDeliveryListResponseSchema) {}
class SstPpeBody extends createZodDto(recordPpeDeliverySchema) {}
class SstCreatedResponse extends createZodDto(sstCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });

// Evaluaciones médicas (concepto de aptitud, nunca diagnósticos) y entrega de elementos de
// protección (B37, decisiones 7, 12 y 13). Las restricciones solo salen en la consulta registrada.

@ApiTags('Seguridad y salud en el trabajo')
@Controller('v1/sst')
@ApiPermissionErrors()
export class HealthController {
  constructor(
    @Inject(MedicalExams) private readonly exams: MedicalExams,
    @Inject(PpeDeliveries) private readonly ppe: PpeDeliveries,
  ) {}

  @Get('medical-exams')
  @RequirePermission('sst.medical.read')
  @ApiOperation({ summary: 'Consultar los conceptos de aptitud (sin las restricciones)' })
  @ZodResponse({ status: HttpStatus.OK, type: SstExamListResponse, description: 'Evaluaciones' })
  async listExams(@CurrentPrincipal() principal: Principal): Promise<SstExamListResponse> {
    return { data: await this.exams.list(principal) };
  }

  @Post('medical-exams/:id/read')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('sst.medical.read')
  @ApiOperation({ summary: 'Consultar una evaluación con sus restricciones; queda registrada' })
  @ZodResponse({ status: HttpStatus.OK, type: SstExamResponse, description: 'Evaluación' })
  async readExam(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
  ): Promise<SstExamResponse> {
    return this.exams.detail(principal, meta, id);
  }

  @Post('medical-exams')
  @RequirePermission('sst.medical.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar el concepto de una evaluación médica ocupacional' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Registrada' })
  async recordExam(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SstExamBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.exams.record(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Get('ppe-deliveries')
  @RequirePermission('sst.read')
  @ApiOperation({ summary: 'Consultar las entregas de elementos de protección' })
  @ZodResponse({ status: HttpStatus.OK, type: SstPpeListResponse, description: 'Entregas' })
  async listPpe(@CurrentPrincipal() principal: Principal): Promise<SstPpeListResponse> {
    return { data: await this.ppe.list(principal) };
  }

  @Post('ppe-deliveries')
  @RequirePermission('sst.ppe.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar la entrega de un elemento de protección' })
  @ZodResponse({ status: HttpStatus.CREATED, type: SstCreatedResponse, description: 'Registrada' })
  async recordPpe(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: SstPpeBody,
  ): Promise<SstCreatedResponse> {
    return { id: await this.ppe.record(principal, meta, idempotencyKeyFrom(key), input) };
  }
}
