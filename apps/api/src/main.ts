import { createApp } from './app.js';
import { ConfigError, loadConfig } from './platform/config/load-config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  const app = await createApp(config);
  await app.listen(config.API_PORT);
}

bootstrap().catch((error: unknown) => {
  // Antes de tener registros configurados, el motivo del fallo va a la salida de errores.
  const reason = error instanceof ConfigError ? error.message : String(error);
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
