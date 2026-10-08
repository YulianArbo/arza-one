import { Module } from '@nestjs/common';

import { AUTHENTICATOR } from '../../../platform/access/principal.js';
import { AccountNotifier } from '../application/account-notifier.js';
import { ChangePasswordUseCase } from '../application/change-password.js';
import { InvitationUseCase } from '../application/invitation.js';
import { LoginUseCase } from '../application/login.js';
import { PasswordResetUseCase } from '../application/password-reset.js';
import { PasswordSetter } from '../application/password-setter.js';
import { ProfileQuery } from '../application/profile.js';
import { SessionService } from '../application/session-service.js';
import { AuthController } from './auth.controller.js';
import { MeController } from './me.controller.js';

/** M01 Identidad (B08): cuentas, inicio de sesión, sesiones y contraseñas. */
@Module({
  controllers: [AuthController, MeController],
  providers: [
    AccountNotifier,
    ChangePasswordUseCase,
    InvitationUseCase,
    LoginUseCase,
    PasswordResetUseCase,
    PasswordSetter,
    ProfileQuery,
    SessionService,
    // La guarda de acceso de la plataforma valida las sesiones con este servicio.
    { provide: AUTHENTICATOR, useExisting: SessionService },
  ],
  exports: [AUTHENTICATOR, InvitationUseCase],
})
export class IamModule {}
