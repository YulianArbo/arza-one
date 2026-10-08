// Servidor simulado para las pruebas del despliegue (B07): registra cada guion y responde según
// reglas. No es parte del despliegue real.
import type { CommandResult, Remote } from './remote.ts';

export const ok = (stdout = ''): CommandResult => ({ status: 0, stdout, stderr: '' });
export const failed = (stderr = 'falló'): CommandResult => ({ status: 1, stdout: '', stderr });

/** Respuesta para los guiones que contienen `fragment` (la primera regla que coincide gana). */
export interface Rule {
  readonly fragment: string;
  readonly answer: CommandResult | ((script: string, calls: number) => CommandResult);
}

export interface FakeServer {
  readonly remote: Remote;
  readonly scripts: string[];
  readonly inputs: (string | Buffer | undefined)[];
  /** Guiones que contienen el fragmento, en orden. */
  readonly matching: (fragment: string) => string[];
}

/** Respuestas por defecto de un servidor sano con Garage ya preparado y dos empresas. */
const HEALTHY_RULES: Rule[] = [
  { fragment: "'layout' 'show'", answer: ok('Current cluster layout version: 1') },
  {
    fragment: 'SELECT id FROM core_tenants',
    answer: ok('0199a8f0-0000-7000-8000-000000000001\n0199a8f0-0000-7000-8000-000000000002\n'),
  },
  {
    fragment: 'rolbypassrls',
    answer: ok('role=false,false\nnone=0\n0199a8f0-0000-7000-8000-000000000001\nown=1\nother=0\n'),
  },
];

export function fakeServer(rules: readonly Rule[] = [], current = ''): FakeServer {
  const scripts: string[] = [];
  const inputs: (string | Buffer | undefined)[] = [];
  const counts = new Map<string, number>();
  const all = [...rules, { fragment: 'readlink', answer: ok(current) }, ...HEALTHY_RULES];
  const remote: Remote = (script, input) => {
    scripts.push(script);
    inputs.push(input);
    const rule = all.find(({ fragment }) => script.includes(fragment));
    if (rule === undefined) return ok();
    const calls = (counts.get(rule.fragment) ?? 0) + 1;
    counts.set(rule.fragment, calls);
    return typeof rule.answer === 'function' ? rule.answer(script, calls) : rule.answer;
  };
  return {
    remote,
    scripts,
    inputs,
    matching: (fragment) => scripts.filter((script) => script.includes(fragment)),
  };
}
