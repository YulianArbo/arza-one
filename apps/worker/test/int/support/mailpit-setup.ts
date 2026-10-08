import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Bandeja de correo desechable, la misma del entorno local (B06).
const MAILPIT_IMAGE = 'axllent/mailpit:v1.31.4';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new GenericContainer(MAILPIT_IMAGE)
    .withExposedPorts(1025, 8025)
    .withWaitStrategy(Wait.forHttp('/readyz', 8025))
    .start();
  const host = container.getHost();
  project.provide('mailpit', {
    smtpHost: host,
    smtpPort: container.getMappedPort(1025),
    apiUrl: `http://${host}:${String(container.getMappedPort(8025))}`,
  });
  return async () => {
    await container.stop();
  };
}
