import { Injectable } from '@nestjs/common';

import { newPasswordProblem } from '../domain/password-policy.js';
import { isLeakedPassword } from '../infrastructure/leaked-passwords.js';
import { hashPassword } from '../infrastructure/password-hasher.js';
import { passwordRejected } from './iam-messages.js';

/** Revisa una contraseña nueva contra las reglas del numeral 15.1 y calcula su huella. */
@Injectable()
export class PasswordSetter {
  async hashNew(password: string): Promise<string> {
    const problem = newPasswordProblem(password, isLeakedPassword);
    if (problem !== null) throw passwordRejected(problem);
    return hashPassword(password);
  }
}
