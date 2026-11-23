import type { LegalTextStatus, PageStatus } from '@arza/contracts';

// Textos del módulo «Sitio web» (B41, numeral 16.6: sin jerga, trato de usted).

type Tone = 'neutral' | 'success' | 'warning' | 'destructive' | 'info';

const WEBSITE_PATH = '/app/sitio-web';

export const WEBSITE_PATHS = {
  home: WEBSITE_PATH,
  pages: `${WEBSITE_PATH}/paginas`,
  texts: `${WEBSITE_PATH}/textos-legales`,
  submissions: `${WEBSITE_PATH}/formularios`,
} as const;

export const PAGE_STATUS_LABELS: Readonly<Record<PageStatus, string>> = {
  draft: 'Borrador',
  published: 'Publicada',
  withdrawn: 'Retirada',
};

export const PAGE_STATUS_TONES: Readonly<Record<PageStatus, Tone>> = {
  draft: 'neutral',
  published: 'success',
  withdrawn: 'warning',
};

export const TEXT_STATUS_LABELS: Readonly<Record<LegalTextStatus, string>> = {
  draft: 'Borrador',
  approved: 'Aprobado',
  published: 'Publicado',
  replaced: 'Reemplazado',
};

export const TEXT_STATUS_TONES: Readonly<Record<LegalTextStatus, Tone>> = {
  draft: 'neutral',
  approved: 'info',
  published: 'success',
  replaced: 'warning',
};

export const BODY_HELP =
  'Texto sencillo: una línea que empieza con «## » es un título; con «- », un elemento de lista; una línea en blanco separa párrafos.';
