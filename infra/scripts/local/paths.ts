import { fileURLToPath } from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../../../', import.meta.url));
export const ENV_PATH = fileURLToPath(new URL('../../../.env', import.meta.url));
export const ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../../.env.example', import.meta.url));
export const COMPOSE_FILE = fileURLToPath(new URL('../../compose/local.yml', import.meta.url));
