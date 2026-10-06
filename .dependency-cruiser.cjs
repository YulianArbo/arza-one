// Fronteras entre módulos y capas (capítulos 8.3 y 11.4, ADR-001).
// Si una regla falla, `pnpm boundaries` y `pnpm check` fallan.

const MODULES = '^apps/api/src/modules/';

// Módulos del núcleo (M00 a M04, M18 y M19), nombrados como su prefijo de permisos (anexo G).
const CORE_MODULES = ['core', 'iam', 'party', 'doc', 'wf', 'privacy', 'audit'];
const CORE = `${MODULES}(${CORE_MODULES.join('|')})/`;

/** Prohíbe que la capa `from` de un módulo importe la capa `to` del mismo módulo. */
function noUpwardLayer(from, to) {
  return {
    name: `no-${from}-to-${to}`,
    comment: `La capa ${from} no puede depender de la capa ${to}: las dependencias apuntan hacia abajo.`,
    severity: 'error',
    from: { path: `${MODULES}([^/]+)/${from}/` },
    to: { path: `${MODULES}$1/${to}/` },
  };
}

module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Las dependencias circulares impiden entender y separar los módulos.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment: 'Todo import debe apuntar a un archivo o paquete que exista.',
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-module-internals',
      comment: 'Un módulo usa a otro solo por su index.ts (interfaz pública) o por eventos.',
      severity: 'error',
      from: { path: `${MODULES}([^/]+)/` },
      to: {
        path: `${MODULES}[^/]+/`,
        pathNot: [`${MODULES}$1/`, `${MODULES}[^/]+/index\\.ts$`],
      },
    },
    {
      name: 'no-core-to-business',
      comment: 'El núcleo no depende de ningún módulo de negocio.',
      severity: 'error',
      from: { path: CORE },
      to: { path: MODULES, pathNot: CORE },
    },
    noUpwardLayer('domain', 'application'),
    noUpwardLayer('domain', 'interface'),
    noUpwardLayer('application', 'interface'),
    noUpwardLayer('infrastructure', 'application'),
    noUpwardLayer('infrastructure', 'interface'),
    {
      name: 'no-web-to-backend',
      comment: 'La web pide los datos a la API; nunca importa código del backend.',
      severity: 'error',
      from: { path: '^apps/web/' },
      to: { path: '^apps/(api|worker)/' },
    },
    {
      name: 'no-api-to-other-apps',
      comment: 'La API no depende de la web ni del worker.',
      severity: 'error',
      from: { path: '^apps/api/' },
      to: { path: '^apps/(web|worker)/' },
    },
    {
      name: 'no-worker-to-web',
      comment: 'El worker no depende de la web.',
      severity: 'error',
      from: { path: '^apps/worker/' },
      to: { path: '^apps/web/' },
    },
    {
      name: 'no-worker-to-module-internals',
      comment: 'El worker reutiliza los módulos de la API solo por su index.ts.',
      severity: 'error',
      from: { path: '^apps/worker/' },
      to: { path: MODULES, pathNot: `${MODULES}[^/]+/index\\.ts$` },
    },
    {
      name: 'no-packages-to-apps',
      comment: 'Los paquetes compartidos no dependen de las aplicaciones.',
      severity: 'error',
      from: { path: '^packages/' },
      to: { path: '^apps/' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    // Solo las salidas de compilación propias; los paquetes instalados también tienen carpetas dist.
    exclude: { path: '^(apps|packages)/[^/]+/(dist|coverage|\\.turbo|\\.next)/' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      extensions: ['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json'],
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
