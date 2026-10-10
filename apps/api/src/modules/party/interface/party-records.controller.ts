import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import {
  approveDueDiligenceRequestSchema,
  bankAccountListResponseSchema,
  contactListResponseSchema,
  createBankAccountRequestSchema,
  createContactRequestSchema,
  createDueDiligenceRequestSchema,
  dueDiligenceListResponseSchema,
  rejectRequestSchema,
  revealedBankAccountSchema,
  updateContactRequestSchema,
} from '@arza/contracts';
import { createZodDto, ZodResponse } from 'nestjs-zod';

import type { AppAbility } from '../../../platform/access/ability.js';
import {
  RecentAuthentication,
  RequirePermission,
} from '../../../platform/access/access.decorators.js';
import { CurrentAbility } from '../../../platform/access/authorizer.js';
import { CurrentPrincipal, type Principal } from '../../../platform/access/principal.js';
import { versionFromIfMatch } from '../../../platform/http/if-match.js';
import { Meta, type RequestMeta } from '../../../platform/http/request-meta.js';
import { ApiPermissionErrors } from '../../../platform/openapi/api-common-errors.js';
import { BankAccountsUseCase } from '../application/bank-accounts.js';
import { ContactsUseCase } from '../application/contacts.js';
import { DueDiligenceUseCase } from '../application/due-diligence.js';
import { ApiIfMatch, ApiPartyWriteErrors, PartyCreatedResponse } from './party-openapi.js';

class ContactListResponse extends createZodDto(contactListResponseSchema) {}
class CreateContactRequest extends createZodDto(createContactRequestSchema) {}
class UpdateContactRequest extends createZodDto(updateContactRequestSchema) {}
class BankAccountListResponse extends createZodDto(bankAccountListResponseSchema) {}
class CreateBankAccountRequest extends createZodDto(createBankAccountRequestSchema) {}
class RevealedBankAccount extends createZodDto(revealedBankAccountSchema) {}
class DueDiligenceListResponse extends createZodDto(dueDiligenceListResponseSchema) {}
class CreateDueDiligenceRequest extends createZodDto(createDueDiligenceRequestSchema) {}
class ApproveDueDiligenceRequest extends createZodDto(approveDueDiligenceRequestSchema) {}
class RejectRequest extends createZodDto(rejectRequestSchema) {}

const UUID = new ParseUUIDPipe();

/** Contactos y firmantes, cuentas bancarias y conocimiento del tercero (M02, B13). */
@ApiTags('Terceros')
@Controller('v1/parties/:id')
@ApiPermissionErrors()
export class PartyRecordsController {
  constructor(
    @Inject(ContactsUseCase) private readonly contacts: ContactsUseCase,
    @Inject(BankAccountsUseCase) private readonly accounts: BankAccountsUseCase,
    @Inject(DueDiligenceUseCase) private readonly reviews: DueDiligenceUseCase,
  ) {}

  @RequirePermission('party.read')
  @Get('contacts')
  @ApiOperation({ summary: 'Contactos de la organización, o donde la persona es contacto' })
  @ZodResponse({ status: HttpStatus.OK, type: ContactListResponse, description: 'Contactos' })
  @ApiPartyWriteErrors()
  async listContacts(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<ContactListResponse> {
    return { data: await this.contacts.list(principal, ability, id) };
  }

  @RequirePermission('party.update')
  @Post('contacts')
  @ApiOperation({ summary: 'Agregar una persona de contacto o firmante' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PartyCreatedResponse, description: 'Creado' })
  @ApiPartyWriteErrors()
  async createContact(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: CreateContactRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PartyCreatedResponse> {
    return { id: await this.contacts.create(principal, id, body, meta) };
  }

  @RequirePermission('party.update')
  @Patch('contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Cambiar el cargo, el principal o si firma' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Guardado' })
  @ApiPartyWriteErrors()
  async updateContact(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('contactId', UUID) contactId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body() body: UpdateContactRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id: contactId, version: versionFromIfMatch(ifMatch) };
    await this.contacts.update(principal, id, target, body, meta);
  }

  @RequirePermission('party.update')
  @Delete('contacts/:contactId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Retirar un contacto' })
  @ApiIfMatch()
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Retirado' })
  @ApiPartyWriteErrors()
  async removeContact(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('contactId', UUID) contactId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    const target = { id: contactId, version: versionFromIfMatch(ifMatch) };
    await this.contacts.remove(principal, id, target, meta);
  }

  @RequirePermission('party.bank_account.read')
  @Get('bank-accounts')
  @ApiOperation({ summary: 'Cuentas bancarias, con solo los cuatro últimos dígitos' })
  @ZodResponse({ status: HttpStatus.OK, type: BankAccountListResponse, description: 'Cuentas' })
  @ApiPartyWriteErrors()
  async listAccounts(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
  ): Promise<BankAccountListResponse> {
    return { data: await this.accounts.list(principal, id) };
  }

  @RequirePermission('party.bank_account.manage')
  @RecentAuthentication()
  @Post('bank-accounts')
  @ApiOperation({
    summary: 'Registrar una cuenta bancaria',
    description: 'Queda pendiente hasta que otra persona la apruebe. Exige confirmar la identidad.',
  })
  @ZodResponse({ status: HttpStatus.CREATED, type: PartyCreatedResponse, description: 'Pendiente' })
  @ApiPartyWriteErrors()
  async createAccount(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: CreateBankAccountRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PartyCreatedResponse> {
    return { id: await this.accounts.create(principal, id, body, meta) };
  }

  @RequirePermission('party.bank_account.approve')
  @RecentAuthentication()
  @Post('bank-accounts/:accountId/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar una cuenta bancaria',
    description: 'Solo una persona distinta de quien la registró. Exige confirmar la identidad.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobada' })
  @ApiPartyWriteErrors()
  async approveAccount(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('accountId', UUID) accountId: string,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.accounts.approve(principal, id, accountId, meta);
  }

  @RequirePermission('party.bank_account.approve')
  @RecentAuthentication()
  @Post('bank-accounts/:accountId/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechazar una cuenta bancaria, con el motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazada' })
  @ApiPartyWriteErrors()
  async rejectAccount(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('accountId', UUID) accountId: string,
    @Body() body: RejectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.accounts.reject(principal, id, accountId, body.note, meta);
  }

  @RequirePermission('party.bank_account.read')
  @RecentAuthentication()
  @Post('bank-accounts/:accountId/actions/reveal')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Ver el número completo de una cuenta',
    description: 'Exige confirmar la identidad y cada consulta queda en la auditoría.',
  })
  @ZodResponse({ status: HttpStatus.OK, type: RevealedBankAccount, description: 'Número' })
  @ApiPartyWriteErrors()
  async revealAccount(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('accountId', UUID) accountId: string,
    @Meta() meta: RequestMeta,
  ): Promise<RevealedBankAccount> {
    return { account_number: await this.accounts.reveal(principal, id, accountId, meta) };
  }

  @RequirePermission('party.read')
  @Get('due-diligence')
  @ApiOperation({ summary: 'Conocimiento del tercero, del más reciente al más antiguo' })
  @ZodResponse({ status: HttpStatus.OK, type: DueDiligenceListResponse, description: 'Revisiones' })
  @ApiPartyWriteErrors()
  async listReviews(
    @CurrentPrincipal() principal: Principal,
    @CurrentAbility() ability: AppAbility,
    @Param('id', UUID) id: string,
  ): Promise<DueDiligenceListResponse> {
    return { data: await this.reviews.list(principal, ability, id) };
  }

  @RequirePermission('party.due_diligence.manage')
  @Post('due-diligence')
  @ApiOperation({ summary: 'Registrar el conocimiento del tercero y su nivel de riesgo' })
  @ZodResponse({ status: HttpStatus.CREATED, type: PartyCreatedResponse, description: 'Pendiente' })
  @ApiPartyWriteErrors()
  async createReview(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Body() body: CreateDueDiligenceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<PartyCreatedResponse> {
    return { id: await this.reviews.create(principal, id, body, meta) };
  }

  @RequirePermission('party.due_diligence.approve')
  @Post('due-diligence/:reviewId/actions/approve')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Aprobar el conocimiento del tercero',
    description: 'Solo una persona distinta de quien lo registró. Sin fecha: revisión en 12 meses.',
  })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Aprobado' })
  @ApiPartyWriteErrors()
  async approveReview(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('reviewId', UUID) reviewId: string,
    @Body() body: ApproveDueDiligenceRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.reviews.approve(principal, { partyId: id, id: reviewId }, body, meta);
  }

  @RequirePermission('party.due_diligence.approve')
  @Post('due-diligence/:reviewId/actions/reject')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Rechazar el conocimiento del tercero, con el motivo' })
  @ApiResponse({ status: HttpStatus.NO_CONTENT, description: 'Rechazado' })
  @ApiPartyWriteErrors()
  async rejectReview(
    @CurrentPrincipal() principal: Principal,
    @Param('id', UUID) id: string,
    @Param('reviewId', UUID) reviewId: string,
    @Body() body: RejectRequest,
    @Meta() meta: RequestMeta,
  ): Promise<void> {
    await this.reviews.reject(principal, { partyId: id, id: reviewId }, body.note, meta);
  }
}
