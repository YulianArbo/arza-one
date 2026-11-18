import type { ConsentGrant, RegisterCandidate } from '@arza/contracts';
import { v7 as uuidv7 } from 'uuid';

import {
  bogotaToday,
  fromCalendarDate,
  nextBusinessCode,
} from '../../../../src/modules/core/index.js';
import type { AccessScenario } from '../../iam/support/access-scenario.js';
import { contactNoticeId } from '../../party/support/party-scenario.js';

/** Cuerpo del registro tal como lo envía el formulario: la ruta completa los campos opcionales. */
export type RegistrationBody = Omit<
  RegisterCandidate,
  'resume_file_id' | 'talent_bank' | 'consent'
> & { consent: Omit<ConsentGrant, 'evidence_file_id'> };

/** Candidato registrado y la vacante a la que se postuló. */
export interface CandidateFixture {
  readonly id: string;
  readonly vacancyId: string;
  readonly version: number;
}

export async function candidateFixture(scenario: AccessScenario): Promise<CandidateFixture> {
  const vacancy = await vacancyFixture(scenario);
  return scenario.inTenant((tx) =>
    tx.hrCandidate.create({
      data: {
        tenantId: scenario.tenant.id,
        vacancyId: vacancy.id,
        partyId: uuidv7(),
        source: 'referral',
        appliedOn: vacancy.openedOn,
        consentId: uuidv7(),
        requestKey: uuidv7(),
      },
    }),
  );
}

async function vacancyFixture(scenario: AccessScenario) {
  const tenantId = scenario.tenant.id;
  const today = fromCalendarDate(bogotaToday(scenario.clock.now()));
  return scenario.inTenant(async (tx) => {
    const code = await nextBusinessCode(tx, 'hr.vacancy', scenario.clock.now(), {
      name: 'Vacantes',
      prefix: 'VAC',
      padding: 4,
    });
    return tx.hrVacancy.create({
      data: {
        tenantId,
        code,
        positionId: uuidv7(),
        reason: 'new_position',
        openedOn: today,
        requestKey: uuidv7(),
      },
    });
  });
}

export async function registrationBody(scenario: AccessScenario): Promise<RegistrationBody> {
  await contactNoticeId(scenario);
  const notice = await scenario.inTenant((tx) =>
    tx.privacyNotice.findFirstOrThrow({
      where: { key: 'authorization_candidate', status: 'published' },
    }),
  );
  const vacancy = await vacancyFixture(scenario);
  const suffix = uuidv7().slice(-10).toUpperCase();
  return {
    vacancy_id: vacancy.id,
    source: 'referral',
    applied_on: bogotaToday(scenario.clock.now()),
    person: {
      first_name: 'Ana',
      last_name: 'Prueba',
      id_type: 'CC',
      id_number: suffix,
      email: `${suffix.toLowerCase()}@candidata.test`,
      phone: null,
    },
    consent: {
      notice_id: notice.id,
      accepted: true,
      purposes: ['RECRUITMENT'],
      channel: 'written',
      granted_on: bogotaToday(scenario.clock.now()),
    },
  };
}
