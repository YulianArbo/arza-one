import { consentGrantSchema, type ConsentChannel } from '@arza/contracts';

// Valores del componente de autorización (B17) y su paso al contrato. El mismo esquema valida en
// la pantalla lo que la API vuelve a validar; la casilla nunca viene marcada.

export interface ConsentValues {
  readonly noticeId: string;
  readonly accepted: boolean;
  readonly purposes: readonly string[];
  readonly channel: ConsentChannel | '';
  readonly grantedOn: string;
  /** Soporte opcional: un archivo propio ya revisado; vacío si no hay. */
  readonly evidenceFileId: string;
}

export const EMPTY_CONSENT: ConsentValues = {
  noticeId: '',
  accepted: false,
  purposes: [],
  channel: '',
  grantedOn: '',
  evidenceFileId: '',
};

/** La autorización como la pide la API (consentGrantSchema). */
export function consentBody(values: ConsentValues): Record<string, unknown> {
  return {
    notice_id: values.noticeId === '' ? null : values.noticeId,
    accepted: values.accepted,
    purposes: values.purposes,
    channel: values.channel === '' ? null : values.channel,
    granted_on: values.grantedOn === '' ? null : values.grantedOn,
    evidence_file_id: values.evidenceFileId === '' ? null : values.evidenceFileId,
  };
}

const MESSAGES: Readonly<Record<string, string>> = {
  notice_id: 'Elija el texto de autorización que conoció la persona.',
  purposes: 'Elija al menos una finalidad autorizada.',
  channel: 'Elija cómo se obtuvo la autorización.',
  granted_on: 'Escriba la fecha de la autorización.',
};

export type ConsentErrors = Readonly<Record<string, string>>;

/** Problemas de la autorización por campo; el de la casilla trae su propio mensaje. */
export function consentErrors(values: ConsentValues): ConsentErrors {
  const result = consentGrantSchema.safeParse(consentBody(values));
  if (result.success) return {};
  const errors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const field = String(issue.path[0] ?? '');
    errors[field] ??=
      field === 'accepted' ? issue.message : (MESSAGES[field] ?? 'Revise este dato.');
  }
  return errors;
}
