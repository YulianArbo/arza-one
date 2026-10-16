import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { commentListSchema, createCommentRequestSchema, recordRefSchema } from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import { RequireRecordAccess } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { CommentsUseCase } from '../application/comments.js';
import { ApiNtfWriteErrors, NtfCreatedResponse } from './ntf-openapi.js';

class RecordQuery extends createZodDto(recordRefSchema) {}
class CommentListResponse extends createZodDto(commentListSchema) {}
class CreateCommentRequest extends createZodDto(createCommentRequestSchema) {}

/**
 * Comentarios con menciones de cualquier registro (B16, ficha 17.5). El permiso lo define el
 * módulo dueño del registro: verlo para leer, trabajar en él para escribir.
 */
@ApiTags('Comentarios y adjuntos')
@Controller('v1/comments')
@RequireRecordAccess()
@ApiPermissionErrors()
export class CommentsController {
  constructor(@Inject(CommentsUseCase) private readonly comments: CommentsUseCase) {}

  @Get()
  @ApiOperation({ summary: 'Comentarios de un registro, del más antiguo al más reciente' })
  @ZodResponse({ status: HttpStatus.OK, type: CommentListResponse, description: 'Comentarios' })
  @ApiNtfWriteErrors()
  async list(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Query() query: RecordQuery,
  ): Promise<CommentListResponse> {
    return this.comments.list(principal, ability, query);
  }

  @Post()
  @ApiOperation({
    summary: 'Comentar un registro',
    description: 'Cada colaborador mencionado recibe un aviso.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: NtfCreatedResponse, description: 'Creado' })
  @ApiNtfWriteErrors()
  async create(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Body() body: CreateCommentRequest,
    @Meta() meta: RequestMeta,
  ): Promise<NtfCreatedResponse> {
    return this.comments.create(principal, ability, body, meta);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar un comentario propio', description: 'No se edita.' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiNtfWriteErrors()
  async remove(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.comments.remove(principal, ability, id, meta);
  }
}
