import { z } from 'zod';

// Piezas comunes del sitio público, sus formularios, textos legales y cookies (M17, B41, ficha 17.18).

export const SITE_ERROR_CODES = {
  recordNotFound: 'SITE_RECORD_NOT_FOUND',
  recordInvalid: 'SITE_RECORD_INVALID',
  statusInvalid: 'SITE_STATUS_INVALID',
  /** Nadie aprueba el texto legal que redactó (B41, decisión 2). */
  selfApproval: 'SITE_SELF_APPROVAL',
  slugTaken: 'SITE_SLUG_TAKEN',
  /** Hay términos de la plataforma nuevos por aceptar (decisión 3). */
  termsPending: 'SITE_TERMS_PENDING',
  termsOutdated: 'SITE_TERMS_OUTDATED',
  /** El sitio no tiene empresa configurada o el formulario no tiene aviso publicado. */
  formUnavailable: 'SITE_FORM_UNAVAILABLE',
  linkInvalid: 'SITE_LINK_INVALID',
} as const;

export const siteIdSchema = z.uuid();
export const siteDateTimeSchema = z.iso.datetime({ offset: true });
export const siteVersionSchema = z.number().int().positive().describe('Versión para If-Match');

/** Un enum de Zod a partir de un diccionario de etiquetas en español. */
export function siteEnumOf<T extends Record<string, unknown>>(
  labels: T,
): z.ZodEnum<{ [K in keyof T & string]: K }> {
  return z.enum(Object.keys(labels) as [keyof T & string, ...(keyof T & string)[]]);
}

/** Una persona, con el nombre para mostrar. */
export const siteRefSchema = z.object({ id: siteIdSchema, name: z.string() });
export const siteCreatedResponseSchema = z.object({ id: siteIdSchema });

/**
 * Cuerpo de páginas y textos legales: texto sencillo (decisión 10). Una línea que empieza con
 * «## » es un título; con «- », un elemento de lista; una línea en blanco separa párrafos.
 */
export const siteBodySchema = z.string().trim().min(20).max(60_000);

export type SiteRef = z.infer<typeof siteRefSchema>;
export type SiteCreatedResponse = z.infer<typeof siteCreatedResponseSchema>;

export type SiteBlock =
  | { readonly kind: 'heading'; readonly text: string }
  | { readonly kind: 'paragraph'; readonly text: string }
  | { readonly kind: 'list'; readonly items: readonly string[] };

/** Divide el texto sencillo en títulos, párrafos y listas, sin interpretar HTML. */
export function siteBlocks(body: string): SiteBlock[] {
  const blocks: SiteBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = (): void => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
    if (list.length > 0) blocks.push({ kind: 'list', items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of body.split(/\r?\n/u)) {
    const line = raw.trim();
    if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length > 0) flush();
      list.push(line.slice(2).trim());
    } else if (line === '') {
      flush();
    } else {
      if (list.length > 0) flush();
      paragraph.push(line);
    }
  }
  flush();
  return blocks;
}
