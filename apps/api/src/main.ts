import { ConfigError, loadConfig } from './platform/config/load-config.js';

async function bootstrap(): Promise<void> {
  const config = loadConfig(process.env);
  // La aplicación (NestJS, Prisma) se carga solo con la configuración ya validada: si falta
  // una variable, la API se detiene de inmediato sin cargar nada más.
  const { createApp } = await import('./app.js');
  const app = await createApp(config);
  await app.listen(config.API_PORT);
}

bootstrap().catch((error: unknown) => {
  // Antes de tener registros configurados, el motivo del fallo va a la salida de errores.
  const reason = error instanceof ConfigError ? error.message : String(error);
  process.stderr.write(`${reason}\n`);
  process.exitCode = 1;
});
