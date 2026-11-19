import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  cancelOffboardingSchema,
  completeOffboardingItemSchema,
  hrCreatedResponseSchema,
  offboardingItemSchema,
  offboardingListResponseSchema,
  startOffboardingSchema,
  type OffboardingItem,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { ApiIdempotencyKey, idempotencyKeyFrom } from '../../../platform/http/idempotency-key.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { MyTasks } from '../application/my-tasks.js';
import { Offboardings } from '../application/offboardings.js';

class OffboardingListResponse extends createZodDto(offboardingListResponseSchema) {}
class StartBody extends createZodDto(startOffboardingSchema) {}
class CancelBody extends createZodDto(cancelOffboardingSchema) {}
class CompleteItemBody extends createZodDto(completeOffboardingItemSchema) {}
class OffboardingCreatedResponse extends createZodDto(hrCreatedResponseSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const IF_MATCH = { name: 'If-Match', required: true, description: 'Versión del retiro' };

// Retiro y paz y salvo (B36, decisiones 9 y 10). Talento humano lo registra, lo anula o emite el paz
// y salvo; cada ítem de la lista lo marca su responsable (el caso de uso lo revisa) o Talento humano.

@ApiTags('Talento Humano')
@Controller('v1/hr/offboardings')
@ApiPermissionErrors()
export class OffboardingController {
  constructor(
    @Inject(Offboardings) private readonly offboardings: Offboardings,
    @Inject(MyTasks) private readonly tasks: MyTasks,
  ) {}

  @Get()
  @RequirePermission('hr.offboarding.manage')
  @ApiOperation({ summary: 'Consultar los retiros con su lista y los activos por devolver' })
  @ZodResponse({ status: HttpStatus.OK, type: OffboardingListResponse, description: 'Retiros' })
  async list(@CurrentPrincipal() principal: Principal): Promise<OffboardingListResponse> {
    return { data: await this.offboardings.list(principal) };
  }

  @Post()
  @RequirePermission('hr.offboarding.manage')
  @ApiIdempotencyKey()
  @ApiOperation({ summary: 'Registrar el retiro de un colaborador' })
  @ZodResponse({
    status: HttpStatus.CREATED,
    type: OffboardingCreatedResponse,
    description: 'Registrado',
  })
  async start(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Headers('idempotency-key') key: string | undefined,
    @Body() input: StartBody,
  ): Promise<OffboardingCreatedResponse> {
    return { id: await this.offboardings.start(principal, meta, idempotencyKeyFrom(key), input) };
  }

  @Post(':id/actions/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.offboarding.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Anular un retiro mientras la cuenta sigue activa' })
  async cancel(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CancelBody,
  ): Promise<void> {
    const target = { id, version: versionFromIfMatch(version) };
    await this.offboardings.cancel(principal, meta, target, input.reason);
  }

  @Post(':id/actions/clear')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.offboarding.manage')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Emitir el paz y salvo' })
  async clear(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Headers('if-match') version: string | undefined,
  ): Promise<void> {
    await this.offboardings.clear(principal, meta, { id, version: versionFromIfMatch(version) });
  }

  @Post(':id/items/:item/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('hr.employee.read')
  @ApiHeader(IF_MATCH)
  @ApiOperation({ summary: 'Marcar hecho un ítem del retiro (su responsable o Talento humano)' })
  async completeItem(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) id: string,
    @Param('item', new ParseEnumPipe(offboardingItemSchema.enum)) item: OffboardingItem,
    @Headers('if-match') version: string | undefined,
    @Body() input: CompleteItemBody,
  ): Promise<void> {
    const target = { id, item, version: versionFromIfMatch(version) };
    await this.tasks.completeOffboarding({ principal, ability }, meta, target, input);
  }
}
