import { Module } from '@nestjs/common';

import { AUTHORIZER } from '../../../platform/access/authorizer.js';
import { AUTHENTICATOR } from '../../../platform/access/principal.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { AccessControlService } from '../application/access-control.js';
import { AccessReviewQuery } from '../application/access-review.js';
import { AccountNotifier } from '../application/account-notifier.js';
import { ActiveSessionsUseCase } from '../application/active-sessions.js';
import { ChangePasswordUseCase } from '../application/change-password.js';
import { DelegationsUseCase } from '../application/delegations.js';
import { InvitationUseCase } from '../application/invitation.js';
import { LoginUseCase } from '../application/login.js';
import { PasswordResetUseCase } from '../application/password-reset.js';
import { PasswordSetter } from '../application/password-setter.js';
import { ProfileQuery } from '../application/profile.js';
import { ReauthenticationUseCase } from '../application/reauthentication.js';
import { RoleAdminUseCase } from '../application/role-admin.js';
import { RoleAssignmentUseCase } from '../application/role-assignment.js';
import { SecondFactorResetUseCase } from '../application/second-factor-reset.js';
import { SecondFactorSettings } from '../application/second-factor-settings.js';
import { SecondFactorSetupUseCase } from '../application/second-factor-setup.js';
import { SecondFactorSignInUseCase } from '../application/second-factor-sign-in.js';
import { SecondFactorVerifier } from '../application/second-factor-verifier.js';
import { SessionService } from '../application/session-service.js';
import { SignInCompletion } from '../application/sign-in-completion.js';
import { UserAdministration } from '../application/user-admin.js';
import { UserDirectoryQuery } from '../application/user-directory.js';
import { UserPositionUseCase } from '../application/user-position.js';
import { VerificationFailures } from '../application/verification-failures.js';
import { AuthController } from './auth.controller.js';
import { DelegationsController } from './delegations.controller.js';
import { MeSecurityController } from './me-security.controller.js';
import { MeController } from './me.controller.js';
import { RolesController } from './roles.controller.js';
import { UsersController } from './users.controller.js';

/**
 * M01 Identidad: cuentas, inicio de sesión, sesiones y contraseñas (B08); segundo factor,
 * sesiones activas, confirmación de identidad y avisos de seguridad (B09); roles, permisos,
 * delegaciones, administración de usuarios y revisión de accesos (B10); cargo de cada persona.
 */
@Module({
  controllers: [
    AuthController,
    MeController,
    MeSecurityController,
    UsersController,
    RolesController,
    DelegationsController,
  ],
  providers: [
    AccessControlService,
    AccessReviewQuery,
    AccountNotifier,
    ActiveSessionsUseCase,
    ChangePasswordUseCase,
    DelegationsUseCase,
    InvitationUseCase,
    LoginUseCase,
    PasswordResetUseCase,
    PasswordSetter,
    ProfileQuery,
    ReauthenticationUseCase,
    RoleAdminUseCase,
    RoleAssignmentUseCase,
    SecondFactorResetUseCase,
    SecondFactorSettings,
    SecondFactorSetupUseCase,
    SecondFactorSignInUseCase,
    SecondFactorVerifier,
    SessionService,
    SignInCompletion,
    UserAdministration,
    UserDirectoryQuery,
    UserPositionUseCase,
    VerificationFailures,
    // Los secretos del segundo factor se cifran con FIELD_ENCRYPTION_KEY (capítulo 12.1).
    {
      provide: FieldCipher,
      useFactory: (config: Env) => new FieldCipher(config.FIELD_ENCRYPTION_KEY),
      inject: [CONFIG],
    },
    // La guarda de acceso de la plataforma valida las sesiones con este servicio.
    { provide: AUTHENTICATOR, useExisting: SessionService },
    // La guarda de autorización calcula los permisos con este servicio (B10).
    { provide: AUTHORIZER, useExisting: AccessControlService },
  ],
  exports: [AUTHENTICATOR, AUTHORIZER, InvitationUseCase],
})
export class IamModule {}
