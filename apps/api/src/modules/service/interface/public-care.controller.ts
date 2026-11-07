import { Body, Controller, HttpCode, HttpStatus, Inject, Post } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import {
  errorResponseSchema,
  publicPqrsfFiledSchema,
  publicPqrsfRequestSchema,
  publicPqrsfStatusRequestSchema,
  publicPqrsfStatusSchema,
  publicSurveyAnswerRequestSchema,
  publicSurveyRequestSchema,
  publicSurveySchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import { Public } from '../../../platform/access/access.decorators.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiCommonErrors } from '../../../platform/openapi/api-common-errors.js';
import { PqrsfIntakeUseCase } from '../application/pqrsf-intake.js';
import { SurveyPublicUseCase } from '../application/survey-public.js';

class PublicPqrsfRequest extends createZodDto(publicPqrsfRequestSchema) {}
class PublicPqrsfFiled extends createZodDto(publicPqrsfFiledSchema) {}
class PublicPqrsfStatusRequest extends createZodDto(publicPqrsfStatusRequestSchema) {}
class PublicPqrsfStatus extends createZodDto(publicPqrsfStatusSchema) {}
class PublicSurveyRequest extends createZodDto(publicSurveyRequestSchema) {}
class PublicSurvey extends createZodDto(publicSurveySchema) {}
class PublicSurveyAnswerRequest extends createZodDto(publicSurveyAnswerRequestSchema) {}
// El nombre de la clase es el nombre del esquema en el OpenAPI.
class PublicCareErrorResponse extends createZodDto(errorResponseSchema) {}

/** Pocas radicaciones por minuto desde un mismo equipo (decisión 12). */
const FILE_THROTTLE = { default: { limit: 5, ttl: 60_000 } };
/** Pocas consultas por minuto: el radicado, el correo y la llave no se adivinan probando. */
const LOOKUP_THROTTLE = { default: { limit: 20, ttl: 60_000 } };

const NOT_FOUND = {
  status: HttpStatus.NOT_FOUND,
  type: PublicCareErrorResponse.Output,
  description: 'No coincide, o el enlace ya no sirve',
};

/**
 * Sitio público de Servicio al cliente (B29, ficha 17.9; Ley 1480, art. 50): radicar una PQRSF,
 * consultar su estado y responder la encuesta de satisfacción, sin sesión. El radicado, el correo y
 * la llave van en el cuerpo de la petición, nunca en la dirección: así no quedan en los registros.
 */
@ApiTags('Sitio público')
@Controller('v1/public')
@Public()
@ApiCommonErrors()
export class PublicCareController {
  constructor(
    @Inject(PqrsfIntakeUseCase) private readonly intake: PqrsfIntakeUseCase,
    @Inject(SurveyPublicUseCase) private readonly surveys: SurveyPublicUseCase,
  ) {}

  @Post('pqrsf')
  @Throttle(FILE_THROTTLE)
  @ApiOperation({
    summary: 'Radicar una PQRSF',
    description: 'Devuelve el radicado y la fecha límite; el acuse llega por correo.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PublicPqrsfFiled, description: 'Radicada' })
  @ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    type: PublicCareErrorResponse.Output,
    description: 'El sitio no tiene empresa configurada',
  })
  async file(
    @Body() body: PublicPqrsfRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PublicPqrsfFiled> {
    return this.intake.filePublic(body, meta);
  }

  @Post('pqrsf/status')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOOKUP_THROTTLE)
  @ApiOperation({
    summary: 'Consultar una PQRSF',
    description: 'Con el radicado y el correo con que se radicó. Queda registrado.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PublicPqrsfStatus, description: 'Estado' })
  @ApiResponse(NOT_FOUND)
  async status(
    @Body() body: PublicPqrsfStatusRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PublicPqrsfStatus> {
    return this.intake.publicStatus(body, meta);
  }

  @Post('surveys/view')
  @HttpCode(HttpStatus.OK)
  @Throttle(LOOKUP_THROTTLE)
  @ApiOperation({
    summary: 'Abrir la encuesta',
    description: 'Con la llave del correo. Queda registrado que se abrió.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: PublicSurvey, description: 'Encuesta' })
  @ApiResponse(NOT_FOUND)
  async viewSurvey(
    @Body() body: PublicSurveyRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PublicSurvey> {
    return this.surveys.view(body, meta);
  }

  @Post('surveys/answer')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(LOOKUP_THROTTLE)
  @ApiOperation({ summary: 'Responder la encuesta', description: 'Una sola vez.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Respondida' })
  @ApiResponse(NOT_FOUND)
  @ApiResponse({
    status: HttpStatus.CONFLICT,
    type: PublicCareErrorResponse.Output,
    description: 'Ya se respondió o el enlace venció',
  })
  async answerSurvey(
    @Body() body: PublicSurveyAnswerRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.surveys.answer(body, meta);
  }
}
