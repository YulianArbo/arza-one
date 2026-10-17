import { GenericContainer, Wait } from 'testcontainers';
import type { TestProject } from 'vitest/node';

// Conversión a PDF desechable, la misma imagen del entorno local y del servidor de pruebas (B18).
const GOTENBERG_IMAGE =
  'gotenberg/gotenberg:8.37.0@sha256:f29984bd1e226bf1b93ba90af06000afa8b315853e99d27b9aaa41b93f15c769';

export default async function setup(project: TestProject): Promise<() => Promise<void>> {
  const container = await new GenericContainer(GOTENBERG_IMAGE)
    .withExposedPorts(3000)
    .withWaitStrategy(Wait.forHttp('/health', 3000))
    .withStartupTimeout(180_000)
    .start();
  project.provide(
    'gotenbergUrl',
    `http://${container.getHost()}:${String(container.getMappedPort(3000))}`,
  );
  return async () => {
    await container.stop();
  };
}
