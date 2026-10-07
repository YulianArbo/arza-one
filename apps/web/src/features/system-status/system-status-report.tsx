'use client';

import {
  HEALTH_COMPONENTS,
  type ComponentStatus,
  type HealthComponent,
  type HealthResponse,
  type VersionResponse,
} from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@arza/ui';
import { CircleCheck, CircleX, RotateCw, TriangleAlert } from 'lucide-react';
import type { JSX } from 'react';

const ENVIRONMENT_LABELS: Record<VersionResponse['environment'], string> = {
  local: 'Local',
  staging: 'Pruebas',
  production: 'Producción',
};

const COMPONENT_LABELS: Record<HealthComponent, string> = {
  database: 'Base de datos',
  queues: 'Colas y caché',
  files: 'Archivos',
};

export interface SystemStatusReportProps {
  version: VersionResponse;
  health: HealthResponse;
  onRefresh: () => void;
}

export function SystemStatusReport({
  version,
  health,
  onRefresh,
}: SystemStatusReportProps): JSX.Element {
  return (
    <div className="flex flex-col gap-4">
      <OverallAlert health={health} />
      <div className="grid gap-4 lg:grid-cols-2">
        <VersionCard version={version} />
        <ComponentsCard health={health} />
      </div>
      <Button variant="outline" className="self-start" onClick={onRefresh}>
        <RotateCw aria-hidden="true" />
        Actualizar
      </Button>
    </div>
  );
}

function OverallAlert({ health }: { health: HealthResponse }): JSX.Element {
  if (health.status === 'ok') {
    return (
      <Alert tone="success">
        <CircleCheck aria-hidden="true" />
        <AlertTitle>Todo funciona</AlertTitle>
        <AlertDescription>La API y las piezas de las que depende responden.</AlertDescription>
      </Alert>
    );
  }
  return (
    <Alert tone="warning">
      <TriangleAlert aria-hidden="true" />
      <AlertTitle>Hay piezas que no responden</AlertTitle>
      <AlertDescription>
        Algunas funciones pueden fallar. Revise el detalle y avise al responsable técnico.
      </AlertDescription>
    </Alert>
  );
}

function VersionCard({ version }: { version: VersionResponse }): JSX.Element {
  const rows: [string, string][] = [
    ['Versión', version.version],
    ['Ambiente', ENVIRONMENT_LABELS[version.environment]],
    ['Commit', version.commit],
  ];
  return (
    <Card aria-labelledby="version-title">
      <CardHeader>
        <CardTitle id="version-title">Versión de la API</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2">
          {rows.map(([label, value]) => (
            <div key={label} className="contents">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium break-all">{value}</dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}

function ComponentsCard({ health }: { health: HealthResponse }): JSX.Element {
  return (
    <Card aria-labelledby="components-title">
      <CardHeader>
        <CardTitle id="components-title">Piezas del sistema</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Pieza</TableHead>
              <TableHead>Estado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {HEALTH_COMPONENTS.map((component) => (
              <TableRow key={component}>
                <TableCell>{COMPONENT_LABELS[component]}</TableCell>
                <TableCell>
                  <StatusBadge status={health.checks[component]} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: ComponentStatus }): JSX.Element {
  return status === 'up' ? (
    <Badge tone="success">
      <CircleCheck aria-hidden="true" />
      Responde
    </Badge>
  ) : (
    <Badge tone="destructive">
      <CircleX aria-hidden="true" />
      No responde
    </Badge>
  );
}
