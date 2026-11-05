'use client';

import {
  memberRoleSchema,
  type MemberRole,
  type ProjectDetail,
  type ProjectMember,
} from '@arza/contracts';
import { SimpleTable, TableCell, TableRow } from '@arza/ui';
import { useState, type JSX } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { optionsOf } from '../crm/labels';
import { RecordDialog } from '../organization/record-dialog';
import { Choice, DialogForm, TextInput } from './form-bits';
import { MEMBER_ROLES } from './labels';
import { useProjectAction, useProjectOptions } from './queries';

// Equipo del proyecto (B26, ficha 17.8): quién está, con qué rol y con qué dedicación. Quien entra
// recibe un aviso y ve el proyecto; quien se retira pierde el acceso de inmediato. El líder se
// cambia editando el proyecto. Lo gestiona el Líder técnico.

interface Props {
  readonly project: ProjectDetail;
}

const ROLE_OPTIONS = optionsOf(
  memberRoleSchema.options.filter((role) => role !== 'leader'),
  MEMBER_ROLES,
);

const FIELDS = [
  { field: 'user_id', id: 'miembro-persona', label: 'Persona' },
  { field: 'role', id: 'miembro-rol', label: 'Rol' },
  { field: 'allocation_pct', id: 'miembro-dedicacion', label: 'Dedicación' },
];

interface MemberValues {
  readonly userId: string;
  readonly role: MemberRole;
  readonly allocation: string;
}

const NEW_MEMBER: MemberValues = { userId: '', role: 'development', allocation: '50' };

function problemsOf(values: MemberValues): Record<string, string> {
  const found: Record<string, string> = {};
  if (values.userId === '') found['user_id'] = 'Elija la persona.';
  const value = Number(values.allocation);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    found['allocation_pct'] = 'Escriba un porcentaje entero de 1 a 100.';
  }
  return found;
}

/** Colaboradores que pueden entrar y todavía no están en el equipo. */
function useCandidates(project: ProjectDetail): { value: string; label: string }[] {
  const people = useProjectOptions().data?.people ?? [];
  const inTeam = new Set(project.members.map((member) => member.person.id));
  return [
    { value: '', label: 'Elija la persona' },
    ...people
      .filter((person) => !inTeam.has(person.id))
      .map((person) => ({ value: person.id, label: person.name })),
  ];
}

function MemberFields(props: {
  readonly values: MemberValues;
  readonly problems: Readonly<Record<string, string>>;
  readonly candidates: readonly { value: string; label: string }[];
  readonly set: (patch: Partial<MemberValues>) => void;
}): JSX.Element {
  return (
    <>
      <Choice
        id="miembro-persona"
        label="Persona"
        options={props.candidates}
        value={props.values.userId}
        error={props.problems['user_id']}
        onValue={(userId) => {
          props.set({ userId });
        }}
      />
      <Choice
        id="miembro-rol"
        label="Rol"
        options={ROLE_OPTIONS}
        value={props.values.role}
        onValue={(role) => {
          props.set({ role: role as MemberRole });
        }}
      />
      <TextInput
        id="miembro-dedicacion"
        label="Dedicación en porcentaje"
        inputMode="numeric"
        value={props.values.allocation}
        error={props.problems['allocation_pct']}
        onValue={(allocation) => {
          props.set({ allocation });
        }}
      />
    </>
  );
}

function AddMember(props: Props & { readonly onDone: () => void }): JSX.Element {
  const api = useApiClient();
  const candidates = useCandidates(props.project);
  const [values, setValues] = useState<MemberValues>(NEW_MEMBER);
  const [problems, setProblems] = useState<Record<string, string>>({});
  const add = useProjectAction<object>(async (body, csrfToken) => {
    await api.post(`/v1/projects/${props.project.id}/members`, { body, csrfToken });
  }, props.onDone);
  const submit = (): void => {
    const found = problemsOf(values);
    setProblems(found);
    if (Object.keys(found).length > 0) return;
    add.execute({
      user_id: values.userId,
      role: values.role,
      allocation_pct: Number(values.allocation),
    });
  };
  return (
    <DialogForm
      problems={problems}
      fields={FIELDS}
      action={add}
      submitLabel="Agregar al equipo"
      onSubmit={submit}
    >
      <MemberFields
        values={values}
        problems={problems}
        candidates={candidates}
        set={(patch) => {
          setValues({ ...values, ...patch });
        }}
      />
    </DialogForm>
  );
}

function RemoveMember(props: Props & { readonly member: ProjectMember }): JSX.Element {
  const api = useApiClient();
  const remove = useProjectAction<undefined>((_args, csrfToken) =>
    api.delete(`/v1/projects/${props.project.id}/members/${props.member.id}`, {
      version: props.member.version,
      csrfToken,
    }),
  );
  return (
    <>
      <ConfirmActionButton
        label={`Retirar a ${props.member.person.name}`}
        title={`¿Retirar a ${props.member.person.name} del equipo?`}
        description="Pierde el acceso al proyecto de inmediato y sus ítems abiertos quedan sin asignar."
        confirmLabel="Sí, retirar"
        variant="destructive"
        disabled={remove.pending}
        onConfirm={() => {
          remove.execute(undefined);
        }}
      />
      {remove.error === null ? null : <FormError error={remove.error} />}
      {remove.dialog}
    </>
  );
}

export function TeamPanel({ project }: Props): JSX.Element {
  const canManage = project.can.manage_members;
  return (
    <div className="flex flex-col gap-4">
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar al equipo"
            variant="outline"
            title="Agregar al equipo"
            description="La persona recibe un aviso y desde ese momento ve el proyecto y su tablero."
          >
            {(close) => <AddMember project={project} onDone={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <SimpleTable
        caption="Equipo del proyecto"
        scrollLabel="Equipo; desplácese a los lados para ver todas las columnas"
        headers={['Persona', 'Rol', 'Dedicación', 'Acción']}
      >
        {project.members.map((member) => (
          <TableRow key={member.id}>
            <TableCell>{member.person.name}</TableCell>
            <TableCell>{MEMBER_ROLES[member.role]}</TableCell>
            <TableCell className="tabular-nums">{String(member.allocation_pct)} %</TableCell>
            <TableCell>
              {canManage && member.role !== 'leader' ? (
                <RemoveMember project={project} member={member} />
              ) : null}
            </TableCell>
          </TableRow>
        ))}
      </SimpleTable>
    </div>
  );
}
