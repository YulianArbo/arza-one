import Handlebars from 'handlebars';

import { escapeHtml } from './notice-email.js';

// Plantillas de salida HTML (B20, numeral 13.2): Handlebars llena las variables {{nombre}} con los
// datos del registro. Cada valor se escapa: lo que escribió una persona nunca se vuelve HTML. Solo
// se permiten las ayudas propias de Handlebars (if, unless, each, with); una instancia aparte evita
// que alguien registre otras.

const engine = Handlebars.create();

/** El HTML de la plantilla no se puede leer: llaves sin cerrar, bloques mal anidados… */
export class TemplateSyntaxError extends Error {
  constructor(detail: string) {
    super(`La plantilla tiene un error: ${detail}`);
    this.name = 'TemplateSyntaxError';
  }
}

const BUILT_IN = new Set(['if', 'unless', 'each', 'with', 'else', 'this']);

const SCOPED = new Set(['each', 'with']);

type Node = hbs.AST.Node;

function helperName(node: Node): string {
  return node.type === 'PathExpression' ? (node as hbs.AST.PathExpression).original : '';
}

function pathName(node: Node | undefined): string | null {
  if (node?.type !== 'PathExpression') return null;
  const path = node as hbs.AST.PathExpression;
  const head = path.parts[0];
  return path.data || head === undefined || BUILT_IN.has(head) ? null : head;
}

function collect(node: Node | undefined, found: Set<string>): void {
  if (node === undefined) return;
  if (node.type === 'Program') {
    for (const child of (node as hbs.AST.Program).body) collect(child, found);
    return;
  }
  if (node.type === 'MustacheStatement' || node.type === 'BlockStatement') {
    const statement = node as hbs.AST.MustacheStatement | hbs.AST.BlockStatement;
    for (const part of [statement.path, ...statement.params]) {
      const name = pathName(part);
      if (name !== null) found.add(name);
    }
    if (node.type !== 'BlockStatement') return;
    const block = node as hbs.AST.BlockStatement;
    // Dentro de each y with las variables son de cada fila, no de primer nivel.
    if (SCOPED.has(helperName(block.path))) return;
    collect(block.program, found);
    collect(block.inverse, found);
  }
}

function parse(body: string): hbs.AST.Program {
  try {
    return engine.parse(body);
  } catch (error) {
    throw new TemplateSyntaxError(error instanceof Error ? error.message : String(error));
  }
}

/** Variables de primer nivel que usa la plantilla, en orden alfabético. Revisa su sintaxis. */
export function htmlTemplateVariables(body: string): string[] {
  const found = new Set<string>();
  collect(parse(body), found);
  return [...found].sort();
}

/** Llena la plantilla con el contexto. Una variable que no existe queda vacía. */
export function renderHtmlTemplate(
  body: string,
  context: Readonly<Record<string, unknown>>,
): string {
  parse(body);
  const template = engine.compile(body, { knownHelpersOnly: true, noEscape: false });
  return template(context);
}

/** Página completa para una plantilla HTML que trae solo el cuerpo. */
export function htmlTemplatePage(title: string, content: string): string {
  if (/<html[\s>]/iu.test(content)) return content;
  return [
    '<!doctype html><html lang="es-CO"><head><meta charset="utf-8">',
    `<title>${escapeHtml(title)}</title>`,
    '<style>body{font-family:Arial,Helvetica,sans-serif;font-size:10px;color:#0d1b2a;margin:0}',
    'table{width:100%;border-collapse:collapse}td,th{border:1px solid #9aa4b2;padding:4px 6px;text-align:left;vertical-align:top}',
    'th{background:#eef1f5}</style></head>',
    `<body>${content}</body></html>`,
  ].join('');
}
