import { LoadingState } from '@arza/ui';
import type { JSX } from 'react';

/** Mientras llega una pantalla de la aplicación: esqueleto, nunca pantalla en blanco (16.5). */
export default function Loading(): JSX.Element {
  return <LoadingState label="Cargando la pantalla" />;
}
