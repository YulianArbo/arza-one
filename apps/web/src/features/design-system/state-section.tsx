'use client';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  ErrorState,
  ForbiddenState,
  LoadingState,
} from '@arza/ui';
import { Plus } from 'lucide-react';
import type { JSX } from 'react';

// Ejemplo fijo de identificador de correlación; no corresponde a ninguna petición real.
const SAMPLE_CORRELATION_ID = '0192f3a1-7c2e-7b11-9a55-2d1c6f0e4a10';

/** Los estados que toda pantalla debe resolver (16.5). */
export function StateSection(): JSX.Element {
  return (
    <Card aria-labelledby="states-title">
      <CardHeader>
        <CardTitle id="states-title">Estados de pantalla</CardTitle>
        <CardDescription>Cargando, vacío, error y sin permiso.</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 lg:grid-cols-2">
        <LoadingState label="Ejemplo de carga" />
        <EmptyState
          title="Aún no hay registros"
          description="Aquí verá los registros cuando se cree el primero."
          action={
            <Button>
              <Plus aria-hidden="true" />
              Crear el primero
            </Button>
          }
        />
        <ErrorState
          message="El servidor no respondió a tiempo."
          correlationId={SAMPLE_CORRELATION_ID}
          onRetry={() => undefined}
        />
        <ForbiddenState />
      </CardContent>
    </Card>
  );
}
