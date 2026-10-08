import { Inject, Injectable, Logger } from '@nestjs/common';
import { v7 as uuidv7 } from 'uuid';

import { JobQueue } from '../../../platform/queues/job-queue.js';
import { JOBS, type AccountEmailPurpose } from '../../../platform/queues/jobs.js';

export interface AccountEmailRequest {
  readonly tenantId: string;
  /** Quien provoca el correo; null si es el sistema o alguien sin sesión. */
  readonly actorId: string | null;
  readonly accountUserId: string;
  readonly purpose: AccountEmailPurpose;
  readonly correlationId: string | null;
}

const logger = new Logger('AccountNotifier');

/**
 * Pide al worker el correo de una cuenta, después de confirmar la transacción. Si la cola no
 * responde, lo registra (sin datos personales) y sigue: la respuesta a la persona no cambia, y
 * así tampoco revela si la cuenta existe. Quien no reciba el correo puede pedirlo de nuevo.
 */
@Injectable()
export class AccountNotifier {
  constructor(@Inject(JobQueue) private readonly queue: JobQueue) {}

  async request(email: AccountEmailRequest): Promise<boolean> {
    try {
      await this.queue.add(JOBS.accountEmail, {
        tenantId: email.tenantId,
        userId: email.actorId,
        accountUserId: email.accountUserId,
        purpose: email.purpose,
        correlationId: email.correlationId ?? uuidv7(),
      });
      return true;
    } catch (error) {
      logger.error(
        `No se pudo encolar el correo «${email.purpose}» (correlación ${email.correlationId ?? 'sin identificador'}): ${String(error)}`,
      );
      return false;
    }
  }
}
