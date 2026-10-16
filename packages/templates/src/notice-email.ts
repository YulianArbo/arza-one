// Marco institucional de los correos de aviso (B16): el texto de la plantilla, un botón a la
// aplicación y la firma de ARZA TECH. Va en texto plano y en HTML; el HTML escapa todo el texto,
// que puede traer lo que una persona escribió en un comentario.

export interface NoticeEmailInput {
  readonly subject: string;
  readonly body: string;
  /** Dirección completa de la aplicación a la que lleva el aviso, si tiene. */
  readonly url: string | null;
}

export interface RenderedEmail {
  readonly subject: string;
  readonly text: string;
  readonly html: string;
}

const SIGNATURE = 'ARZA ONE · ARZA TECH S.A.S.';
const AUTOMATIC = 'Este es un correo automático; no lo responda.';
const OPEN_LABEL = 'Abrir en ARZA ONE';
/** Colores de la marca (packages/ui, --brand-primary y --brand-navy). */
const PRIMARY = '#005afe';
const NAVY = '#0d1b2a';

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char);
}

function paragraphs(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((part) => `<p style="margin:0 0 16px">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function button(url: string): string {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:${PRIMARY};color:#ffffff;padding:10px 18px;border-radius:6px;text-decoration:none;font-weight:600">${OPEN_LABEL}</a></p>`;
}

function html(input: NoticeEmailInput): string {
  return [
    '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">',
    `<title>${escapeHtml(input.subject)}</title></head>`,
    `<body style="margin:0;padding:24px;background:#f4f6fa;font-family:Arial,Helvetica,sans-serif;color:${NAVY}">`,
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">',
    `<p style="margin:0 0 20px;font-weight:700;color:${PRIMARY}">ARZA ONE</p>`,
    paragraphs(input.body),
    input.url === null ? '' : button(input.url),
    `<p style="margin:24px 0 0;font-size:12px;color:#5b6573">${SIGNATURE}<br>${AUTOMATIC}</p>`,
    '</div></body></html>',
  ].join('');
}

/** El correo de un aviso, listo para enviar. */
export function noticeEmail(input: NoticeEmailInput): RenderedEmail {
  const link = input.url === null ? [] : [`${OPEN_LABEL}: ${input.url}`];
  return {
    subject: input.subject,
    text: [input.body, ...link, `${SIGNATURE}\n${AUTOMATIC}`].join('\n\n'),
    html: html(input),
  };
}
