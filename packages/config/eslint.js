// Configuración compartida de ESLint. Aplica las reglas de código limpio del capítulo 11.2.
import js from '@eslint/js';
import comments from '@eslint-community/eslint-plugin-eslint-comments/configs';
import next from '@next/eslint-plugin-next';
import jsxA11y from 'eslint-plugin-jsx-a11y-x';
import reactHooks from 'eslint-plugin-react-hooks';
import unicorn from 'eslint-plugin-unicorn';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const CLEAN_CODE_RULES = {
  'max-lines': ['error', { max: 300, skipBlankLines: true, skipComments: true }],
  'max-lines-per-function': ['error', { max: 40, skipBlankLines: true, skipComments: true }],
  'max-depth': ['error', 3],
  'no-console': 'error',
  eqeqeq: ['error', 'always'],
  'unicorn/filename-case': ['error', { case: 'kebabCase' }],
  // Toda desactivación de una regla debe explicar el porqué (capítulo 11.2).
  '@eslint-community/eslint-comments/require-description': ['error', { ignore: [] }],
  '@eslint-community/eslint-comments/no-unlimited-disable': 'error',
};

const TYPESCRIPT_RULES = {
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  // NestJS declara los módulos como clases vacías con el decorador @Module (ADR-004).
  '@typescript-eslint/no-extraneous-class': ['error', { allowWithDecorator: true }],
};

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.next/**',
      'docs/**',
      // Cliente generado por Prisma (B03): no se edita a mano.
      '**/src/generated/**',
    ],
  },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
  },
  js.configs.recommended,
  comments.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  {
    plugins: { unicorn },
    languageOptions: {
      globals: globals.node,
      parserOptions: { projectService: true },
    },
    rules: { ...CLEAN_CODE_RULES, ...TYPESCRIPT_RULES },
  },
  // Interfaz (B04): reglas de React, accesibilidad WCAG (16.6) y buenas prácticas de Next.js.
  {
    files: ['apps/web/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
  },
  { ...reactHooks.configs.flat.recommended, files: ['**/*.tsx'] },
  { ...jsxA11y.configs.strict, files: ['**/*.tsx'] },
  {
    ...next.configs['core-web-vitals'],
    files: ['apps/web/**/*.{ts,tsx}'],
    settings: { next: { rootDir: 'apps/web/' } },
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['**/*.js', '**/*.cjs', '**/*.mjs'],
    rules: { '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    files: ['**/*.cjs'],
    languageOptions: { sourceType: 'commonjs' },
  },
);
