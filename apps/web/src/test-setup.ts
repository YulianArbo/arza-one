import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

// Las pantallas consultan la API simulada antes de mostrarse; en equipos lentos eso puede pasar
// de 1 s, la espera por defecto de findBy y waitFor.
configure({ asyncUtilTimeout: 5000 });

// Cada prueba empieza con el documento vacío.
afterEach(() => {
  cleanup();
});
