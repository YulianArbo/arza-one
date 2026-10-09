import { Module } from '@nestjs/common';

import { AUTHENTICATOR } from '../../../platform/access/principal.js';
import { CONFIG } from '../../../platform/config/config.module.js';
import type { Env } from '../../../platform/config/env-schema.js';
import { FieldCipher } from '../../../platform/crypto/field-cipher.js';
import { AccountNotifier } from '../application/account-notifier.js';
import { ActiveSessionsUseCase } from '../application/active-sessions.js';
import { ChangePasswordUseCase } from '../application/change-password.js';
import { InvitationUseCase } from '../application/invitation.js';
import { LoginUseCase } from '../application/login.js';
import { PasswordResetUseCase } from '../application/password-reset.js';
import { PasswordSetter } from '../application/password-setter.js';
import { ProfileQuery } from '../application/profile.js';
import { ReauthenticationUseCase } from '../application/reauthentication.js';
import { SecondFactorResetUseCase } from '../application/second-factor-reset.js';
import { SecondFactorSettings } from '../application/second-factor-settings.js';
import { SecondFactorSetupUseCase } from '../application/second-factor-setup.js';
import { SecondFactorSignInUseCase } from '../application/second-factor-sign-in.js';
import { SecondFactorVerifier } from '../application/second-factor-verifier.js';
import { SessionService } from '../application/session-service.js';
import { SignInCompletion } from '../application/sign-in-completion.js';
import { VerificationFailures } from '../application/verification-failures.js';
import { AuthController } from './auth.controller.js';
import { MeSecurityController } from './me-security.controller.js';
import { MeController } from './me.controller.js';

/**
 * M01 Identidad: cuentas, inicio de sesión, sesiones y contraseñas (B08); segundo factor,
 * sesiones activas, confirmación de identidad y avisos de seguridad (B09).
 */
@Module({
  controllers: [AuthController, MeController, MeSecurityController],
  providers: [
    AccountNotifier,
    ActiveSessionsUseCase,
    ChangePasswordUseCase,
    InvitationUseCase,
    LoginUseCase,
    PasswordResetUseCase,
    PasswordSetter,
    ProfileQuery,
    ReauthenticationUseCase,
    SecondFactorResetUseCase,
    SecondFactorSettings,
    SecondFactorSetupUseCase,
    SecondFactorSignInUseCase,
    SecondFactorVerifier,
    SessionService,
    SignInCompletion,
    VerificationFailures,
    // Los secretos del segundo factor se cifran con FIELD_ENCRYPTION_KEY (capítulo 12.1).
    {
      provide: FieldCipher,
      useFactory: (config: Env) => new FieldCipher(config.FIELD_ENCRYPTION_KEY),
      inject: [CONFIG],
    },
    // La guarda de acceso de la plataforma valida las sesiones con este servicio.
    { provide: AUTHENTICATOR, useExisting: SessionService },
  ],
  exports: [AUTHENTICATOR, InvitationUseCase],
})
export class IamModule {}
