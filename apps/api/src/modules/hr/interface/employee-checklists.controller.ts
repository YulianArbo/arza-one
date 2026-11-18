import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseEnumPipe,
  ParseUUIDPipe,
  Post,
  Put,
} from '@nestjs/common';
import { ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  completeOnboardingTaskSchema,
  fileItemSchema,
  updateFileEntrySchema,
  type FileItem,
} from '@arza/contracts';
import { createZodDto } from 'nestjs-zod';

import { hasUnconditionalPermission, type AppAbility } from '../../../platform/access/ability.js';
import { RequirePermission } from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { permissionDenied } from '../../../platform/access/permission-denied.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { EmployeeChecklists } from '../application/employee-checklists.js';

class UpdateFileEntryBody extends createZodDto(updateFileEntrySchema) {}
class CompleteTaskBody extends createZodDto(completeOnboardingTaskSchema) {}
const UUID = new ParseUUIDPipe({ version: '7' });
const ITEM = new ParseEnumPipe(fileItemSchema.enum);

@ApiTags('Talento Humano')
@Controller('v1/hr/employees/:id')
@ApiPermissionErrors()
@ApiHeader({ name: 'If-Match', required: true, description: 'Versión del registro' })
@RequirePermission('hr.employee.manage')
export class EmployeeChecklistsController {
  constructor(@Inject(EmployeeChecklists) private readonly checklists: EmployeeChecklists) {}

  @Put('file/:item')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Actualizar un ítem del expediente laboral' })
  async updateFile(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) employeeId: string,
    @Param('item', ITEM) item: FileItem,
    @Headers('if-match') version: string | undefined,
    @Body() input: UpdateFileEntryBody,
  ): Promise<void> {
    if (!hasUnconditionalPermission(ability, 'hr.file.read')) throw permissionDenied();
    await this.checklists.updateFile(
      principal,
      meta,
      { employeeId, item, version: versionFromIfMatch(version) },
      input,
    );
  }

  @Post('onboarding/:taskId/actions/complete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Registrar que se completó una tarea de inducción' })
  async completeTask(
    @CurrentPrincipal() principal: Principal,
    @Meta() meta: RequestMeta,
    @Param('id', UUID) employeeId: string,
    @Param('taskId', UUID) taskId: string,
    @Headers('if-match') version: string | undefined,
    @Body() input: CompleteTaskBody,
  ): Promise<void> {
    await this.checklists.completeTask(
      principal,
      meta,
      { employeeId, taskId, version: versionFromIfMatch(version) },
      input,
    );
  }
}
