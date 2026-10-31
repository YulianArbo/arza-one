import {
  ENVELOPE_STATUSES,
  SIGNATURE_EVENTS,
  SIGNER_KINDS,
  SIGNER_STATUSES,
  type EnvelopeStatus,
  type SignerStatus,
} from '@arza/contracts';

// Textos de la firma electrónica (B25). Las etiquetas vienen de los contratos; aquí, los tonos.

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

export { ENVELOPE_STATUSES, SIGNATURE_EVENTS, SIGNER_KINDS, SIGNER_STATUSES };

export const ENVELOPE_TONES: Readonly<Record<EnvelopeStatus, Tone>> = {
  draft: 'neutral',
  sent: 'info',
  completed: 'success',
  rejected: 'destructive',
  expired: 'warning',
  cancelled: 'neutral',
};

export const SIGNER_TONES: Readonly<Record<SignerStatus, Tone>> = {
  waiting: 'neutral',
  pending: 'info',
  signed: 'success',
  rejected: 'destructive',
};
