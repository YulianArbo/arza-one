'use client';

import {
  Alert,
  AlertDescription,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogTrigger,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@arza/ui';
import { CircleCheck, Info, Plus, TriangleAlert } from 'lucide-react';
import type { JSX } from 'react';

export function ButtonSection(): JSX.Element {
  return (
    <Card aria-labelledby="buttons-title">
      <CardHeader>
        <CardTitle id="buttons-title">Botones</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-3">
        <Button>
          <Plus aria-hidden="true" />
          Crear registro
        </Button>
        <Button variant="secondary">Guardar borrador</Button>
        <Button variant="outline">Cancelar</Button>
        <Button variant="ghost">Ver más</Button>
        <Button variant="link">Abrir procedimiento</Button>
        <Button disabled>Enviar a aprobación</Button>
        <ConfirmationExample />
      </CardContent>
    </Card>
  );
}

/** Acción irreversible (16.5): el diálogo nombra el registro y la consecuencia. */
function ConfirmationExample(): JSX.Element {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="destructive">Anular registro</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogTitle>¿Anular el registro EJ-2026-0001?</AlertDialogTitle>
        <AlertDialogDescription>
          El registro quedará anulado y no podrá volver a usarse. Esta acción no se puede deshacer.
        </AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          <AlertDialogAction>Anular registro</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function FeedbackSection(): JSX.Element {
  return (
    <Card aria-labelledby="feedback-title">
      <CardHeader>
        <CardTitle id="feedback-title">Estados y mensajes</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge tone="success">
            <CircleCheck aria-hidden="true" />
            Aprobado
          </Badge>
          <Badge tone="warning">
            <TriangleAlert aria-hidden="true" />
            Por vencer
          </Badge>
          <Badge tone="destructive">Rechazado</Badge>
          <Badge tone="info">En revisión</Badge>
          <Badge>Borrador</Badge>
        </div>
        <Alert tone="info">
          <Info aria-hidden="true" />
          <AlertTitle>Cambios guardados</AlertTitle>
          <AlertDescription>La confirmación es breve y no interrumpe el trabajo.</AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

export function FormSection(): JSX.Element {
  return (
    <Card aria-labelledby="form-title">
      <CardHeader>
        <CardTitle id="form-title">Campos de formulario</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="example-name">Nombre del cliente</Label>
          <Input id="example-name" placeholder="Ejemplo: Empresa Demo S.A.S." />
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="example-code">Código</Label>
          <Input
            id="example-code"
            aria-invalid="true"
            aria-describedby="example-code-error"
            defaultValue="123"
          />
          <p id="example-code-error" className="text-destructive">
            El código debe tener el formato PREFIJO-AAAA-NNNN.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
