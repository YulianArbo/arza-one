// Migraciones compatibles hacia atrás (numerales 10.6 y 11.4, paso 7): la versión anterior de la
// API debe seguir funcionando con la base ya migrada (expandir, migrar, contraer).

/** Marca que autoriza, con su motivo, un cambio destructivo en la fase de contraer. */
const CONTRACT_MARKER = /--[ \t]*arza:contract[ \t]+(\S.{9,})$/m;

type Severity = 'compatibility' | 'security';

interface Rule {
  pattern: RegExp;
  severity: Severity;
  reason: string;
}

const RULES: readonly Rule[] = [
  {
    pattern: /\b(DISABLE|NO\s+FORCE)\s+ROW\s+LEVEL\s+SECURITY\b/i,
    severity: 'security',
    reason: 'desactiva la seguridad por fila (ADR-007); nunca se permite',
  },
  {
    pattern: /\bDROP\s+(TABLE|COLUMN|SCHEMA|TYPE|VIEW|POLICY)\b/i,
    severity: 'compatibility',
    reason: 'borra un objeto que la versión anterior todavía usa',
  },
  {
    pattern:
      /\bALTER\s+TABLE\b[^;]*\bDROP\s+(?!CONSTRAINT|DEFAULT|NOT\s+NULL|IDENTITY|EXPRESSION)"?\w+"?/i,
    severity: 'compatibility',
    reason: 'borra una columna que la versión anterior todavía usa',
  },
  {
    pattern: /\bRENAME\b/i,
    severity: 'compatibility',
    reason: 'renombra un objeto: la versión anterior lo buscará con el nombre viejo',
  },
  {
    pattern: /\bALTER\s+COLUMN\b[^;]*\bTYPE\b/i,
    severity: 'compatibility',
    reason: 'cambia el tipo de una columna',
  },
  {
    pattern: /\bSET\s+NOT\s+NULL\b/i,
    severity: 'compatibility',
    reason: 'vuelve obligatoria una columna que la versión anterior puede dejar vacía',
  },
  {
    pattern: /\bADD\s+(?!CONSTRAINT\b)(COLUMN\s+)?(?![^;]*\bDEFAULT\b)[^;]*\bNOT\s+NULL\b/i,
    severity: 'compatibility',
    reason: 'agrega una columna obligatoria sin valor por defecto',
  },
  {
    pattern: /\b(TRUNCATE|DELETE\s+FROM)\b/i,
    severity: 'compatibility',
    reason: 'borra datos',
  },
];

export interface Finding {
  file: string;
  statement: string;
  severity: Severity;
  reason: string;
}

function withoutComments(sql: string): string {
  return sql.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/--[^\n]*/g, ' ');
}

function summarize(statement: string): string {
  const compact = statement.replaceAll(/\s+/g, ' ').trim();
  return compact.length > 100 ? `${compact.slice(0, 97)}...` : compact;
}

/** Sentencias de una migración que romperían la versión anterior o la seguridad. */
export function findUnsafeStatements(file: string, sql: string): Finding[] {
  return withoutComments(sql)
    .split(';')
    .flatMap((statement) => {
      // Una sola razón por sentencia: la primera regla, con la seguridad antes que todo.
      const rule = RULES.find((candidate) => candidate.pattern.test(statement));
      if (rule === undefined) return [];
      const { severity, reason } = rule;
      return [{ file, statement: summarize(statement), severity, reason }];
    });
}

/** Quita los hallazgos de compatibilidad si la migración declara la fase de contraer. */
export function applyContractMarker(sql: string, findings: Finding[]): Finding[] {
  if (!CONTRACT_MARKER.test(sql)) return findings;
  return findings.filter((finding) => finding.severity === 'security');
}
