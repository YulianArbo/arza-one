'use client';

import {
  APTITUDE_CONCEPTS,
  COMMITTEES,
  COMPLAINT_STATUS,
  EXAM_KINDS,
  QUICK_REPORT_KINDS,
  completeInvestigationActionSchema,
  fileComplaintSchema,
  myMedicalExamsSchema,
  mySstSchema,
  ownComplaintSchema,
  type MedicalExam,
  type MyInvestigationAction,
  type MySst as MySstData,
} from '@arza/contracts';
import { HighlightCard } from '@arza/ui';
import Link from 'next/link';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { QueryState } from '../administration/query-state';
import { HrActionButton, HrDialogForm, HrList, HrSection, orNull } from '../hr/hr-dialog';
import { HomeInspectionForm } from './my-sst-home';
import { useSstQuery } from './sst-queries';

// Lo de SST en «Mi espacio» (B37): reportar desde el celular, el estado de lo reportado, los
// elementos de protección por confirmar, la autoinspección del puesto en casa, las acciones que le
// asignaron, sus conceptos de aptitud (la consulta queda registrada) y el canal confidencial de
// convivencia.

function ReportCard({ committees }: { readonly committees: MySstData['committees'] }) {
  return (
    <HighlightCard title="Seguridad y salud en el trabajo" highlighted>
      <p>¿Vio algo inseguro o tuvo un incidente? Repórtelo en menos de un minuto.</p>
      <Link className="font-semibold underline" href="/app/mi-espacio/reportar">
        Reportar a SST
      </Link>
      {committees.length === 0 ? null : (
        <p>
          Integra: {committees.map((committee) => COMMITTEES[committee]).join(' · ')}.{' '}
          <Link className="underline" href="/app/talento-y-sst/sst/comites">
            Ir a comités
          </Link>
        </p>
      )}
    </HighlightCard>
  );
}

function Reports({ data }: { readonly data: MySstData }): JSX.Element {
  return (
    <HrSection id="mis-reportes-sst" title="Mis reportes a SST">
      <HrList
        items={data.reports}
        empty="No ha hecho reportes."
        keyOf={(item) => item.id}
        render={(item) => (
          <>
            <span>
              <strong>{item.code}</strong> · {QUICK_REPORT_KINDS[item.kind]} · {item.location}
            </span>
            <span>
              {formatDateTime(item.reported_at)} · {item.status}
            </span>
          </>
        )}
      />
    </HrSection>
  );
}

function Ppe({ data }: { readonly data: MySstData }): JSX.Element {
  const api = useApiClient();
  return (
    <HrSection id="mis-epp" title="Mis elementos de protección">
      <HrList
        items={data.ppe}
        empty="No tiene entregas registradas."
        keyOf={(item) => item.id}
        render={(item) => (
          <>
            <span>
              <strong>{item.item_label}</strong> × {String(item.quantity)} · entregado el{' '}
              {formatDate(item.delivered_on)}
            </span>
            {item.acknowledged_at === null ? (
              <HrActionButton
                label="Confirmar recibo"
                pendingLabel="Confirmando…"
                ariaLabel={`Confirmar que recibió ${item.item_label}`}
                run={(csrfToken) =>
                  api.post(`/v1/sst/me/ppe-deliveries/${item.id}/actions/acknowledge`, {
                    body: {},
                    csrfToken,
                    version: item.version,
                  })
                }
              />
            ) : (
              <span>Recibido</span>
            )}
          </>
        )}
      />
    </HrSection>
  );
}

function ActionRow({ item }: { readonly item: MyInvestigationAction }): JSX.Element {
  const api = useApiClient();
  return (
    <>
      <span>
        <strong>{item.incident_code}</strong> · {item.description} · vence {formatDate(item.due_on)}
      </span>
      <HrDialogForm
        allowed
        label="Marcar hecha"
        title={`Acción del ${item.incident_code}`}
        description={item.description}
        fields={[
          { key: 'done_on', label: 'Fecha en que se hizo', type: 'date' },
          { key: 'note', label: 'Nota (opcional)' },
        ]}
        schema={completeInvestigationActionSchema}
        prepare={(values) => ({ ...values, note: orNull(values['note']) })}
        run={(body, csrfToken) =>
          api.post(`/v1/sst/investigation-actions/${item.id}/actions/complete`, {
            body,
            csrfToken,
            version: item.version,
          })
        }
        submitLabel="Marcar hecha"
      />
    </>
  );
}

function Actions({ data }: { readonly data: MySstData }): JSX.Element | null {
  if (data.actions.length === 0 && data.home_inspections.length === 0) return null;
  return (
    <HrSection id="mis-tareas-sst" title="Mis tareas de SST">
      {data.home_inspections.map((inspection) => (
        <HomeInspectionForm key={inspection.id} inspection={inspection} />
      ))}
      <HrList
        items={data.actions}
        empty="No tiene acciones pendientes de investigaciones."
        keyOf={(item) => item.id}
        render={(item) => <ActionRow item={item} />}
      />
    </HrSection>
  );
}

function ExamView({ exams }: { readonly exams: readonly MedicalExam[] }): JSX.Element {
  if (exams.length === 0) return <p>No tiene evaluaciones médicas registradas.</p>;
  return (
    <ul className="flex w-full flex-col gap-2">
      {exams.map((exam) => (
        <li key={exam.id} className="rounded-md bg-muted p-3">
          <strong>{APTITUDE_CONCEPTS[exam.concept]}</strong> · {EXAM_KINDS[exam.kind]} del{' '}
          {formatDate(exam.exam_date)}
          {exam.restrictions === null ? null : <p>Restricciones: {exam.restrictions}</p>}
          {exam.next_due_on === null ? null : <p>Próxima: {formatDate(exam.next_due_on)}</p>}
        </li>
      ))}
    </ul>
  );
}

function MyExams(): JSX.Element {
  const api = useApiClient();
  const [exams, setExams] = useState<MedicalExam[] | null>(null);
  return (
    <HrSection id="mis-conceptos" title="Mis conceptos de aptitud">
      <p className="text-muted-foreground">
        Solo usted y SST los ven. Nunca se guardan diagnósticos. La consulta queda registrada.
      </p>
      <HrActionButton
        label="Ver mis conceptos"
        pendingLabel="Abriendo…"
        ariaLabel="Ver mis conceptos de aptitud"
        run={async (csrfToken) => {
          const result = await api.post('/v1/sst/me/medical-exams/read', {
            body: {},
            csrfToken,
            schema: myMedicalExamsSchema,
          });
          setExams(result.data);
        }}
      />
      {exams === null ? null : <ExamView exams={exams} />}
    </HrSection>
  );
}

function Complaints({ data }: { readonly data: MySstData }): JSX.Element {
  const api = useApiClient();
  const [key] = useState(() => crypto.randomUUID());
  return (
    <HrSection id="mi-convivencia" title="Comité de Convivencia Laboral">
      <p className="text-muted-foreground">
        Canal confidencial: solo los integrantes del comité leen su queja. Usted verá el estado.
      </p>
      <HrDialogForm
        allowed
        label="Presentar una queja"
        title="Queja confidencial al Comité de Convivencia"
        description="Cuente qué pasó, cuándo y quiénes estuvieron."
        fields={[{ key: 'facts', label: 'Qué pasó' }]}
        schema={fileComplaintSchema}
        run={(body, csrfToken) =>
          api.post('/v1/sst/complaints', {
            body,
            csrfToken,
            schema: ownComplaintSchema,
            idempotencyKey: key,
          })
        }
        submitLabel="Enviar al comité"
      />
      <HrList
        items={data.complaints}
        empty="No ha presentado quejas."
        keyOf={(item) => item.id}
        render={(item) => (
          <span>
            <strong>{item.code}</strong> · {formatDateTime(item.received_at)} ·{' '}
            {COMPLAINT_STATUS[item.status]}
          </span>
        )}
      />
    </HrSection>
  );
}

export function MySst(): JSX.Element {
  const query = useSstQuery('/v1/sst/me', mySstSchema);
  return (
    <QueryState query={query} loadingLabel="Cargando lo de SST">
      {(data) => (
        <>
          <ReportCard committees={data.committees} />
          <Actions data={data} />
          <Reports data={data} />
          <Ppe data={data} />
          <MyExams />
          <Complaints data={data} />
        </>
      )}
    </QueryState>
  );
}
