'use client';

import {
  APTITUDE_CONCEPTS,
  EXAM_KINDS,
  PPE_CATALOG,
  catalogDetailResponseSchema,
  medicalExamListResponseSchema,
  medicalExamSchema,
  ppeDeliveryListResponseSchema,
  recordMedicalExamSchema,
  recordPpeDeliverySchema,
  sstCreatedResponseSchema,
  type MedicalExam,
  type MedicalExamSummary,
  type PpeDelivery,
} from '@arza/contracts';
import { Badge, PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import {
  HrActionButton,
  HrDialogForm,
  HrList,
  HrSection,
  optionsOf,
  orNull,
} from '../hr/hr-dialog';
import { usePermissions } from '../session/permissions';
import { useSstEmployees } from './sst-options';
import { useSstQuery } from './sst-queries';

// Evaluaciones médicas y elementos de protección (B37, decisiones 7 y 12). Solo el concepto de
// aptitud: nunca diagnósticos. Las restricciones se ven con «Ver restricciones» y la consulta queda
// registrada.

function RestrictionsButton(props: {
  readonly exam: MedicalExamSummary;
  readonly onRead: (detail: MedicalExam) => void;
}): JSX.Element {
  const api = useApiClient();
  return (
    <HrActionButton
      label="Ver restricciones"
      pendingLabel="Abriendo…"
      ariaLabel={`Ver las restricciones de ${props.exam.employee.name}`}
      run={async (csrfToken) => {
        const path = `/v1/sst/medical-exams/${props.exam.id}/read`;
        props.onRead(await api.post(path, { body: {}, csrfToken, schema: medicalExamSchema }));
      }}
    />
  );
}

function ExamRow({ exam }: { readonly exam: MedicalExamSummary }): JSX.Element {
  const [detail, setDetail] = useState<MedicalExam | null>(null);
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{exam.employee.name}</strong> · {EXAM_KINDS[exam.kind]} del{' '}
          {formatDate(exam.exam_date)} · {APTITUDE_CONCEPTS[exam.concept]}
        </span>
        <span>
          {exam.provider}
          {exam.next_due_on === null ? null : ` · próxima ${formatDate(exam.next_due_on)}`}{' '}
          {exam.due_soon ? <Badge tone="warning">Vence pronto</Badge> : null}
        </span>
        {detail === null ? null : <span>Restricciones: {detail.restrictions ?? 'Ninguna'}</span>}
      </span>
      {exam.has_restrictions ? <RestrictionsButton exam={exam} onRead={setDetail} /> : null}
    </>
  );
}

const EXAM_FIELDS = [
  { key: 'kind', label: 'Tipo de evaluación', options: optionsOf(EXAM_KINDS) },
  { key: 'exam_date', label: 'Fecha de la evaluación', type: 'date' as const },
  { key: 'provider', label: 'Institución que la hizo' },
  { key: 'concept', label: 'Concepto de aptitud', options: optionsOf(APTITUDE_CONCEPTS) },
  { key: 'restrictions', label: 'Restricciones o recomendaciones (opcional)' },
  { key: 'next_due_on', label: 'Próxima evaluación (opcional)', type: 'date' as const },
];

function NewExam(): JSX.Element | null {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useSstEmployees();
  return (
    <HrDialogForm
      allowed={canAll('sst.medical.manage')}
      label="Registrar concepto"
      title="Registrar el concepto de una evaluación"
      description="Escriba solo el concepto y las restricciones. Nunca diagnósticos."
      fields={[{ key: 'employee_id', label: 'Colaborador', options: employees }, ...EXAM_FIELDS]}
      schema={recordMedicalExamSchema}
      prepare={(values) => ({
        ...values,
        restrictions: orNull(values['restrictions']),
        next_due_on: orNull(values['next_due_on']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/sst/medical-exams', {
          body,
          csrfToken,
          schema: sstCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Registrar"
    />
  );
}

function Exams(): JSX.Element {
  const { canAll } = usePermissions();
  const reads = canAll('sst.medical.read');
  const query = useSstQuery('/v1/sst/medical-exams', medicalExamListResponseSchema, reads);
  if (!reads) return <p>Los conceptos de aptitud solo los ve SST.</p>;
  return (
    <HrSection id="examenes" title="Evaluaciones médicas ocupacionales">
      <NewExam />
      <QueryState query={query} loadingLabel="Cargando evaluaciones">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay evaluaciones registradas."
            keyOf={(item) => item.id}
            render={(item) => <ExamRow exam={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function usePpeItems(enabled: boolean) {
  const query = useSstQuery(`/v1/catalogs/${PPE_CATALOG}`, catalogDetailResponseSchema, enabled);
  return (query.data?.items ?? [])
    .filter((item) => item.is_active)
    .map((item) => ({ value: item.code, label: item.label }));
}

function NewDelivery({ allowed }: { readonly allowed: boolean }): JSX.Element | null {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  const employees = useSstEmployees(allowed);
  const items = usePpeItems(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Registrar entrega"
      title="Registrar la entrega de un elemento"
      description="El colaborador confirmará el recibo desde Mi espacio."
      fields={[
        { key: 'employee_id', label: 'Colaborador', options: employees },
        { key: 'item', label: 'Elemento', options: items },
        { key: 'quantity', label: 'Cantidad', type: 'number', value: '1' },
        { key: 'delivered_on', label: 'Fecha de entrega', type: 'date' },
        { key: 'note', label: 'Nota (opcional)' },
      ]}
      schema={recordPpeDeliverySchema}
      prepare={(values) => ({
        ...values,
        quantity: Number(values['quantity']),
        note: orNull(values['note']),
      })}
      run={(body, csrfToken) =>
        api.post('/v1/sst/ppe-deliveries', {
          body,
          csrfToken,
          schema: sstCreatedResponseSchema,
          idempotencyKey: key,
        })
      }
      submitLabel="Registrar"
    />
  );
}

function DeliveryRow({ item }: { readonly item: PpeDelivery }): JSX.Element {
  return (
    <>
      <span>
        <strong>{item.employee.name}</strong> · {item.item_label} × {String(item.quantity)} ·{' '}
        {formatDate(item.delivered_on)}
      </span>
      {item.acknowledged_at === null ? (
        <Badge tone="warning">Sin confirmar</Badge>
      ) : (
        <Badge tone="success">Recibido</Badge>
      )}
    </>
  );
}

function Ppe(): JSX.Element {
  const { canAll } = usePermissions();
  const query = useSstQuery('/v1/sst/ppe-deliveries', ppeDeliveryListResponseSchema);
  return (
    <HrSection id="epp" title="Entrega de elementos de protección">
      <NewDelivery allowed={canAll('sst.ppe.manage')} />
      <QueryState query={query} loadingLabel="Cargando entregas">
        {({ data }) => (
          <HrList
            items={data}
            empty="No hay entregas registradas."
            keyOf={(item) => item.id}
            render={(item) => <DeliveryRow item={item} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

export function SstHealth(): JSX.Element {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Salud y protección"
        description="Conceptos de aptitud (nunca diagnósticos) y entrega de elementos de protección."
      />
      <Exams />
      <Ppe />
    </div>
  );
}
