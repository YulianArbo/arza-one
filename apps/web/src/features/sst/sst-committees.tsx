'use client';

import {
  COMMITTEES,
  COMMITTEE_ROLES,
  COMPLAINT_STATUS,
  REPRESENTS,
  addCommitteeMemberSchema,
  committeeMemberListResponseSchema,
  committeeMinuteListResponseSchema,
  complaintListResponseSchema,
  endCommitteeMemberSchema,
  handleComplaintSchema,
  mySstSchema,
  recordCommitteeMinuteSchema,
  sstCreatedResponseSchema,
  type Committee,
  type CommitteeMember,
  type CommitteeMinute,
  type Complaint,
} from '@arza/contracts';
import { PageHeader } from '@arza/ui';
import { useState, type JSX } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
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
import { useSstPeople } from './sst-options';
import { useSstQuery } from './sst-queries';

// Comités y canal confidencial de convivencia (B37, decisiones 8 y 9). SST gestiona quiénes los
// integran; las actas y las quejas de Convivencia solo las ven sus integrantes vigentes. Cada
// consulta de lo de Convivencia queda registrada.

function AddMember({ allowed }: { readonly allowed: boolean }): JSX.Element | null {
  const api = useApiClient();
  const people = useSstPeople(allowed);
  return (
    <HrDialogForm
      allowed={allowed}
      label="Agregar integrante"
      title="Agregar un integrante a un comité"
      description="El periodo incluye su último día."
      fields={[
        { key: 'committee', label: 'Comité', options: optionsOf(COMMITTEES) },
        { key: 'user_id', label: 'Persona', options: people },
        { key: 'role', label: 'Papel', options: optionsOf(COMMITTEE_ROLES) },
        { key: 'represents', label: 'Representa a', options: optionsOf(REPRESENTS) },
        { key: 'from_on', label: 'Desde', type: 'date' },
        { key: 'until_on', label: 'Hasta (opcional)', type: 'date' },
      ]}
      schema={addCommitteeMemberSchema}
      prepare={(values) => ({ ...values, until_on: orNull(values['until_on']) })}
      run={(body, csrfToken) =>
        api.post('/v1/sst/committee-members', { body, csrfToken, schema: sstCreatedResponseSchema })
      }
      submitLabel="Agregar"
    />
  );
}

function MemberRow(props: { readonly item: CommitteeMember; readonly manages: boolean }) {
  const api = useApiClient();
  const { item } = props;
  return (
    <>
      <span>
        <strong>{item.person.name}</strong> · {COMMITTEES[item.committee]} ·{' '}
        {COMMITTEE_ROLES[item.role]} · {REPRESENTS[item.represents]} · desde{' '}
        {formatDate(item.from_on)}
        {item.until_on === null ? '' : ` hasta ${formatDate(item.until_on)}`}
        {item.active ? '' : ' · fuera del periodo'}
      </span>
      <HrDialogForm
        allowed={props.manages && item.until_on === null}
        label="Terminar periodo"
        title={`Terminar el periodo de ${item.person.name}`}
        description="Desde el día siguiente deja de ver lo del comité."
        fields={[{ key: 'until_on', label: 'Último día', type: 'date' }]}
        schema={endCommitteeMemberSchema}
        run={(body, csrfToken) =>
          api.post(`/v1/sst/committee-members/${item.id}/actions/end`, {
            body,
            csrfToken,
            version: item.version,
          })
        }
        submitLabel="Terminar"
      />
    </>
  );
}

function Members(): JSX.Element | null {
  const { canAll } = usePermissions();
  const reads = canAll('sst.committee.read');
  const manages = canAll('sst.committee.manage');
  const query = useSstQuery('/v1/sst/committee-members', committeeMemberListResponseSchema, reads);
  if (!reads) return null;
  return (
    <HrSection id="integrantes" title="Integrantes">
      <AddMember allowed={manages} />
      <QueryState query={query} loadingLabel="Cargando integrantes">
        {({ data }) => (
          <HrList
            items={data}
            empty="Los comités aún no tienen integrantes."
            keyOf={(item) => item.id}
            render={(item) => <MemberRow item={item} manages={manages} />}
          />
        )}
      </QueryState>
    </HrSection>
  );
}

function RecordMinute({ committee }: { readonly committee: Committee }): JSX.Element | null {
  const api = useApiClient();
  return (
    <HrDialogForm
      allowed
      label="Registrar acta"
      title={`Registrar un acta · ${COMMITTEES[committee]}`}
      description="Resuma los temas tratados y los compromisos."
      fields={[
        { key: 'meeting_on', label: 'Fecha de la reunión', type: 'date' },
        { key: 'summary', label: 'Temas y compromisos' },
      ]}
      schema={recordCommitteeMinuteSchema}
      prepare={(values) => ({ ...values, committee, file_id: null })}
      run={(body, csrfToken) =>
        api.post('/v1/sst/committee-minutes', { body, csrfToken, schema: sstCreatedResponseSchema })
      }
      submitLabel="Registrar"
    />
  );
}

function Minutes({ committee }: { readonly committee: Committee }): JSX.Element {
  const api = useApiClient();
  const [minutes, setMinutes] = useState<CommitteeMinute[] | null>(null);
  return (
    <HrSection id={`actas-${committee}`} title={`Actas · ${COMMITTEES[committee]}`}>
      <div className="flex flex-wrap gap-2">
        <RecordMinute committee={committee} />
        <HrActionButton
          label="Ver actas"
          pendingLabel="Abriendo…"
          ariaLabel={`Ver las actas de ${COMMITTEES[committee]}`}
          run={async (csrfToken) => {
            const body = { committee };
            const schema = committeeMinuteListResponseSchema;
            setMinutes(
              (await api.post('/v1/sst/committee-minutes/read', { body, csrfToken, schema })).data,
            );
          }}
        />
      </div>
      {minutes === null ? null : (
        <HrList
          items={minutes}
          empty="No hay actas registradas."
          keyOf={(item) => item.id}
          render={(item) => (
            <span>
              <strong>{formatDate(item.meeting_on)}</strong> · {item.summary} ·{' '}
              {item.recorded_by.name}
            </span>
          )}
        />
      )}
    </HrSection>
  );
}

function ComplaintRow({ complaint }: { readonly complaint: Complaint }): JSX.Element {
  const api = useApiClient();
  return (
    <>
      <span className="flex flex-col">
        <span>
          <strong>{complaint.code}</strong> · {formatDateTime(complaint.received_at)} ·{' '}
          {COMPLAINT_STATUS[complaint.status]} · {complaint.complainant.name}
        </span>
        <span>{complaint.facts}</span>
        {complaint.outcome === null ? null : <span>Gestión: {complaint.outcome}</span>}
      </span>
      <HrDialogForm
        allowed={complaint.status !== 'closed'}
        label="Tramitar"
        title={`Tramitar ${complaint.code}`}
        description="Para cerrar, registre la gestión del comité."
        fields={[
          {
            key: 'status',
            label: 'Estado',
            options: optionsOf({ in_review: 'En trámite', closed: 'Cerrada' }),
          },
          { key: 'outcome', label: 'Gestión del comité' },
        ]}
        schema={handleComplaintSchema}
        prepare={(values) => ({ ...values, outcome: orNull(values['outcome']) })}
        run={(body, csrfToken) =>
          api.post(`/v1/sst/complaints/${complaint.id}/actions/handle`, {
            body,
            csrfToken,
            version: complaint.version,
          })
        }
        submitLabel="Guardar"
      />
    </>
  );
}

function Complaints(): JSX.Element {
  const api = useApiClient();
  const [complaints, setComplaints] = useState<Complaint[] | null>(null);
  return (
    <HrSection id="quejas" title="Quejas de convivencia">
      <p className="text-muted-foreground">
        Información confidencial: cada consulta queda registrada.
      </p>
      <HrActionButton
        label="Ver quejas"
        pendingLabel="Abriendo…"
        ariaLabel="Ver las quejas de convivencia"
        run={async (csrfToken) => {
          const schema = complaintListResponseSchema;
          setComplaints(
            (await api.post('/v1/sst/complaints/read', { body: {}, csrfToken, schema })).data,
          );
        }}
      />
      {complaints === null ? null : (
        <HrList
          items={complaints}
          empty="No hay quejas."
          keyOf={(item) => item.id}
          render={(item) => <ComplaintRow complaint={item} />}
        />
      )}
    </HrSection>
  );
}

export function SstCommittees(): JSX.Element {
  const { canAll } = usePermissions();
  const mine = useSstQuery('/v1/sst/me', mySstSchema);
  const member = new Set(mine.data?.committees ?? []);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        title="Comités"
        description="COPASST o Vigía de SST y Comité de Convivencia Laboral."
      />
      <Members />
      {member.has('copasst') || canAll('sst.committee.read') ? (
        <Minutes committee="copasst" />
      ) : null}
      {member.has('coexistence') ? (
        <>
          <Minutes committee="coexistence" />
          <Complaints />
        </>
      ) : (
        <p>Las actas y quejas de Convivencia solo las ven los integrantes vigentes del comité.</p>
      )}
    </div>
  );
}
