'use client';

import {
  Alert,
  AlertDescription,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageHeader,
  QuickLinks,
  TextareaField,
} from '@arza/ui';
import { Send } from 'lucide-react';
import Link from 'next/link';
import type { JSX } from 'react';

import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { usePermissions } from '../session/permissions';
import { AnswerCard } from './assistant-answer';
import { useAsk, useAssistantStatus } from './assistant-queries';
import { ASSISTANT_PATHS } from './labels';
import { useTextForm } from './text-form';

// Asistente de inteligencia artificial (M20, B47): preguntas sobre los documentos que la persona
// puede abrir, con sus fuentes. Desde aquí también se llega al registro de usos, a la activación
// de los usos y a las instrucciones, según el rol.

const LINKS = [
  { href: ASSISTANT_PATHS.usage, label: 'Registro de usos', permission: 'ai.request.read' },
  { href: ASSISTANT_PATHS.useCases, label: 'Usos activos', permission: 'ai.use_case.manage' },
  { href: ASSISTANT_PATHS.prompts, label: 'Instrucciones', permission: 'ai.prompt.manage' },
] as const;

const MIN_QUESTION = 5;

function AskForm(): JSX.Element {
  const ask = useAsk();
  const form = useTextForm(
    MIN_QUESTION,
    'Escriba una pregunta de al menos cinco letras.',
    ask.execute,
  );
  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-col gap-3" onSubmit={form.submit} noValidate>
            <TextareaField
              id="asistente-pregunta"
              label="Su pregunta"
              hint="Por ejemplo: ¿cómo se solicita un cambio en un documento? El asistente solo usa los documentos que usted puede abrir."
              value={form.value}
              maxLength={500}
              error={form.problem}
              onChange={(event) => {
                form.change(event.target.value);
              }}
            />
            <div>
              <Button type="submit" className="bg-action" disabled={ask.pending}>
                <Send aria-hidden="true" /> {ask.pending ? 'Buscando…' : 'Preguntar'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      {ask.error === null ? null : <FormError error={ask.error} />}
      {ask.result === undefined || ask.pending ? null : (
        <AnswerCard key={ask.result.request_id} answer={ask.result} />
      )}
      {ask.dialog}
    </div>
  );
}

function Usable(): JSX.Element {
  const status = useAssistantStatus();
  return (
    <QueryState query={status} loadingLabel="Cargando el asistente">
      {(data) => {
        if (data.provider === 'off') {
          return (
            <EmptyState
              title="El asistente no está disponible"
              description="Esta instalación no tiene un proveedor de inteligencia artificial configurado."
            />
          );
        }
        if (!data.enabled_use_cases.includes('doc_search')) {
          return (
            <EmptyState
              title="Las preguntas sobre documentos no están activas"
              description="Las activa el Oficial de datos después de aprobar la evaluación de impacto."
            />
          );
        }
        return (
          <div className="flex flex-col gap-4">
            <Alert tone="info">
              <AlertDescription>
                Hoy lleva {data.used_today} de {data.daily_limit} usos. El asistente propone; usted
                decide.
              </AlertDescription>
            </Alert>
            <AskForm />
          </div>
        );
      }}
    </QueryState>
  );
}

export function AssistantHome(): JSX.Element {
  const { can, canAll } = usePermissions();
  const links = LINKS.filter((link) => canAll(link.permission));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Asistente"
        description="Pregunte sobre los documentos de la empresa. Cada respuesta dice en qué documentos se basa."
      />
      {can('ai.assist.use') ? <Usable /> : null}
      {links.length === 0 ? null : (
        <QuickLinks title="Gobierno del asistente" links={links} linkAs={Link} />
      )}
    </div>
  );
}
