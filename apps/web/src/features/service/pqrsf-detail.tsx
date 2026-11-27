'use client';

import type { PqrsfDetail } from '@arza/contracts';
import {
  Alert,
  AlertDescription,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { FactsCard, type Fact } from '../crm/crm-facts';
import { RecordDialog } from '../organization/record-dialog';
import { AssistantPanel } from '../assistant/assistant-panel';
import { usePqrsf } from './care-queries';
import {
  PQRSF_APPROVALS,
  PQRSF_CHANNELS,
  PQRSF_DUE_STATES,
  PQRSF_DUE_TONES,
  PQRSF_STATUSES,
  PQRSF_STATUS_TONES,
  PQRSF_TYPES,
  PRIVACY_KINDS,
  SERVICE_PATHS,
} from './labels';
import {
  AssignPqrsfForm,
  ClassifyForm,
  DraftForm,
  ReturnForm,
  usePqrsfStep,
} from './pqrsf-step-forms';

// Ficha de la PQRSF (B29, FT-SAC-002): su plazo en días hábiles, lo que se puede hacer según el
// estado y el permiso, los datos de quien la presentó y la respuesta (borrador o enviada).

interface Props {
  readonly pqrsf: PqrsfDetail;
}

/** Lo que conviene saber de la PQRSF ahora, en frases cortas. */
function messages(pqrsf: PqrsfDetail): { tone: 'info' | 'warning'; text: string }[] {
  const found: { tone: 'info' | 'warning'; text: string }[] = [];
  if (pqrsf.due_state === 'overdue') {
    found.push({
      tone: 'warning',
      text: `Venció el ${formatDate(pqrsf.due_on)}: respóndala cuanto antes.`,
    });
  } else if (pqrsf.due_state === 'at_risk') {
    found.push({
      tone: 'warning',
      text: `Quedan pocos días hábiles: vence el ${formatDate(pqrsf.due_on)}.`,
    });
  }
  if (pqrsf.transferred_at !== null) {
    found.push({
      tone: 'info',
      text: 'Trata de datos personales: se trasladó a Privacidad y sigue los plazos de la Ley 1581.',
    });
  }
  if (pqrsf.approval === 'returned' && pqrsf.return_reason !== null) {
    found.push({
      tone: 'warning',
      text: `La respuesta volvió para corregir: ${pqrsf.return_reason}`,
    });
  }
  if (pqrsf.nonconformity_at !== null) {
    found.push({ tone: 'info', text: 'Calidad recibió la solicitud de no conformidad.' });
  }
  return found;
}

function requesterFacts(pqrsf: PqrsfDetail): Fact[] {
  return [
    ['Presentada por', pqrsf.requester_name],
    ['Correo', pqrsf.requester_email ?? 'Sin correo'],
    ['Teléfono', pqrsf.requester_phone ?? '—'],
    ['Tercero', pqrsf.party?.name ?? 'Sin vincular'],
  ];
}

function facts(pqrsf: PqrsfDetail): Fact[] {
  return [
    ['Asunto', pqrsf.subject],
    ['Descripción', pqrsf.description],
    ['Tipo', PQRSF_TYPES[pqrsf.type]],
    ['Datos personales', pqrsf.privacy_kind === null ? 'No' : PRIVACY_KINDS[pqrsf.privacy_kind]],
    ['Canal', PQRSF_CHANNELS[pqrsf.channel]],
    ...requesterFacts(pqrsf),
    ['Radicada', formatDateTime(pqrsf.received_at)],
    ['Plazo', `${String(pqrsf.term_days)} días hábiles: vence el ${formatDate(pqrsf.due_on)}`],
    [
      'Acuse por correo',
      pqrsf.ack_sent_at === null ? 'Pendiente o sin correo' : formatDateTime(pqrsf.ack_sent_at),
    ],
    ['Responsable', pqrsf.assignee?.name ?? 'Sin asignar'],
    ['Registrada por', pqrsf.created_by?.name ?? 'Sitio público'],
  ];
}

function ResponseCard({ pqrsf }: Props): JSX.Element {
  const sent = pqrsf.response !== null;
  const text = sent ? pqrsf.response : pqrsf.response_draft;
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {sent ? 'Respuesta enviada' : 'Borrador de respuesta'}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p className="whitespace-pre-line">{text ?? 'Todavía no hay respuesta.'}</p>
        {pqrsf.drafted_by === null ? null : (
          <p className="text-muted-foreground">Redactó: {pqrsf.drafted_by.name}</p>
        )}
        {pqrsf.approved_by === null ? null : (
          <p className="text-muted-foreground">
            Aprobó: {pqrsf.approved_by.name} el {formatDateTime(pqrsf.responded_at)}
            {pqrsf.response_sent_at === null
              ? ''
              : ` · enviada por correo el ${formatDateTime(pqrsf.response_sent_at)}`}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function OneClick(props: Props & { readonly action: string; readonly label: string }): JSX.Element {
  const step = usePqrsfStep(props.pqrsf, props.action);
  return (
    <div className="flex flex-col gap-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={step.pending}
        onClick={() => {
          step.execute({});
        }}
      >
        {props.label}
      </Button>
      {step.error === null ? null : <FormError error={step.error} />}
      {step.dialog}
    </div>
  );
}

interface DialogSpec {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly render: (close: () => void) => JSX.Element;
}

function dialogsOf(pqrsf: PqrsfDetail): DialogSpec[] {
  const specs: DialogSpec[] = [];
  const { can } = pqrsf;
  if (can.classify) {
    specs.push({
      label: pqrsf.status === 'filed' ? 'Clasificar' : 'Reclasificar',
      title: `Clasificar ${pqrsf.code}`,
      description: 'El plazo se vuelve a calcular con el tipo elegido.',
      render: (close) => <ClassifyForm pqrsf={pqrsf} onDone={close} />,
    });
  }
  if (can.assign && pqrsf.status !== 'classified') {
    specs.push({
      label: 'Reasignar',
      title: `Reasignar ${pqrsf.code}`,
      description: 'A otra persona de Servicio al cliente o al Líder técnico.',
      render: (close) => <AssignPqrsfForm pqrsf={pqrsf} onDone={close} />,
    });
  }
  if (can.draft) {
    specs.push({
      label: pqrsf.response_draft === null ? 'Redactar la respuesta' : 'Editar la respuesta',
      title: `Respuesta a ${pqrsf.code}`,
      description: 'Después envíela a aprobación: la aprueba otra persona.',
      render: (close) => <DraftForm pqrsf={pqrsf} onDone={close} />,
    });
  }
  if (can.approve) {
    specs.push({
      label: 'Devolver',
      title: `Devolver la respuesta de ${pqrsf.code}`,
      description: 'Quien la redactó verá su motivo.',
      render: (close) => <ReturnForm pqrsf={pqrsf} onDone={close} />,
    });
  }
  return specs;
}

function clicksOf(pqrsf: PqrsfDetail): { action: string; label: string }[] {
  const { can } = pqrsf;
  const canSubmit = can.draft && pqrsf.status === 'in_progress' && pqrsf.response_draft !== null;
  return [
    ...(canSubmit ? [{ action: 'respond', label: 'Enviar a aprobación' }] : []),
    ...(can.approve ? [{ action: 'approve', label: 'Aprobar y enviar' }] : []),
    ...(can.close ? [{ action: 'close', label: 'Cerrar' }] : []),
  ];
}

function PqrsfActions({ pqrsf }: Props): JSX.Element | null {
  const dialogs = dialogsOf(pqrsf);
  const clicks = clicksOf(pqrsf);
  if (dialogs.length === 0 && clicks.length === 0) return null;
  return (
    <div
      className="flex flex-wrap items-start gap-2"
      role="group"
      aria-label="Acciones de la PQRSF"
    >
      {dialogs.map((spec) => (
        <RecordDialog
          key={spec.label}
          triggerLabel={spec.label}
          variant="outline"
          title={spec.title}
          description={spec.description}
        >
          {spec.render}
        </RecordDialog>
      ))}
      {clicks.map((click) => (
        <OneClick key={click.action} pqrsf={pqrsf} action={click.action} label={click.label} />
      ))}
    </div>
  );
}

function Detail({ pqrsf }: Props): JSX.Element {
  return (
    <>
      <PageHeader title={pqrsf.code} description={pqrsf.subject} />
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={PQRSF_STATUS_TONES[pqrsf.status]}>{PQRSF_STATUSES[pqrsf.status]}</Badge>
        <Badge tone="neutral">{PQRSF_TYPES[pqrsf.type]}</Badge>
        <Badge tone={PQRSF_DUE_TONES[pqrsf.due_state]}>{PQRSF_DUE_STATES[pqrsf.due_state]}</Badge>
        {pqrsf.approval === 'none' ? null : (
          <Badge tone="warning">{PQRSF_APPROVALS[pqrsf.approval]}</Badge>
        )}
      </div>
      {messages(pqrsf).map((message) => (
        <Alert key={message.text} tone={message.tone}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ))}
      <PqrsfActions pqrsf={pqrsf} />
      {pqrsf.privacy_kind === null ? (
        <AssistantPanel targetId={pqrsf.id} useCases={['pqrsf_classify', 'pqrsf_reply']} />
      ) : null}
      <ResponseCard pqrsf={pqrsf} />
      <FactsCard title="Datos de la PQRSF" facts={facts(pqrsf)} />
    </>
  );
}

export function PqrsfDetailPanel({ id }: { readonly id: string }): JSX.Element {
  const pqrsf = usePqrsf(id);
  return (
    <div className="flex flex-col gap-4">
      <Link
        href={SERVICE_PATHS.pqrsfInbox}
        className="text-sm text-primary underline-offset-4 hover:underline"
      >
        ← Volver a las PQRSF
      </Link>
      <QueryState query={pqrsf} loadingLabel="Cargando la PQRSF">
        {(data) => <Detail pqrsf={data} />}
      </QueryState>
    </div>
  );
}
