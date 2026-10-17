'use client';

import {
  LINK_ENTITIES,
  LINK_RELATIONS,
  linkEntitySchema,
  linkRelationSchema,
  type DocumentLink,
} from '@arza/contracts';
import { EmptyState, TableCell, TableRow } from '@arza/ui';
import { Link2 } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { QueryState } from '../administration/query-state';
import { SelectField } from '../administration/select-field';
import { SimpleTable } from '../administration/simple-table';
import { useOrgUnits, usePositions } from '../organization/queries';
import { RecordDialog } from '../organization/record-dialog';
import { useParties } from '../parties/queries';
import { usePermissions } from '../session/permissions';
import { LINK_ENTITY_OPTIONS, LINK_RELATION_OPTIONS } from './labels';
import { useCreateLink, useDocumentLinks, useRemoveLink } from './queries';

// Vínculos del documento (B18; numeral 18.2, paso 3): el manual de funciones con su cargo, el
// procedimiento con su proceso, el soporte con su tercero.

interface Option {
  readonly value: string;
  readonly label: string;
}

function useRecordOptions(type: string): Option[] {
  const positions = usePositions().data?.data ?? [];
  const units = useOrgUnits().data?.data ?? [];
  const parties = useParties({ q: '', role: '', status: '' }, null).data?.data ?? [];
  if (type === 'position') {
    return positions.filter((p) => p.is_active).map((p) => ({ value: p.id, label: p.name }));
  }
  if (type === 'process') {
    return units
      .filter((u) => u.kind === 'process' && u.is_active)
      .map((u) => ({ value: u.id, label: `${u.code} · ${u.name}` }));
  }
  return parties.map((p) => ({ value: p.id, label: p.name }));
}

interface LinkValues {
  readonly type: string;
  readonly entityId: string;
  readonly relation: string;
}

/** Tipo de registro, registro y relación del vínculo nuevo. */
function LinkFields(props: {
  readonly values: LinkValues;
  readonly problem: string | undefined;
  readonly onChange: (values: LinkValues) => void;
}): JSX.Element {
  const { values, onChange } = props;
  const options = useRecordOptions(values.type);
  return (
    <>
      <SelectField
        id="vinculo-tipo"
        label="Tipo de registro"
        value={values.type}
        options={LINK_ENTITY_OPTIONS}
        onChange={(event) => {
          onChange({ ...values, type: event.target.value, entityId: '' });
        }}
      />
      <SelectField
        id="vinculo-registro"
        label="Registro"
        value={values.entityId}
        error={props.problem}
        options={[{ value: '', label: 'Elija un registro' }, ...options]}
        onChange={(event) => {
          onChange({ ...values, entityId: event.target.value });
        }}
      />
      <SelectField
        id="vinculo-relacion"
        label="Relación"
        value={values.relation}
        options={LINK_RELATION_OPTIONS}
        onChange={(event) => {
          onChange({ ...values, relation: event.target.value });
        }}
      />
    </>
  );
}

function LinkForm(props: {
  readonly documentId: string;
  readonly onSaved: () => void;
}): JSX.Element {
  const [values, setValues] = useState<LinkValues>({
    type: 'process',
    entityId: '',
    relation: 'applies_to',
  });
  const [problem, setProblem] = useState<string | undefined>(undefined);
  const save = useCreateLink(props.documentId, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setProblem(values.entityId === '' ? 'Elija el registro que quiere vincular.' : undefined);
    if (values.entityId === '') return;
    save.execute({
      entity_type: linkEntitySchema.parse(values.type),
      entity_id: values.entityId,
      relation: linkRelationSchema.parse(values.relation),
    });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <LinkFields values={values} problem={problem} onChange={setValues} />
      <SubmitButton label="Vincular" pendingLabel="Vinculando…" pending={save.pending} />
      {save.dialog}
    </form>
  );
}

function LinkRow(props: {
  readonly documentId: string;
  readonly link: DocumentLink;
  readonly canEdit: boolean;
}): JSX.Element {
  const remove = useRemoveLink(props.documentId);
  const { link } = props;
  const name = link.entity_name ?? 'Registro retirado';
  return (
    <TableRow>
      <TableCell>{LINK_RELATIONS[link.relation]}</TableCell>
      <TableCell>{LINK_ENTITIES[link.entity_type]}</TableCell>
      <TableCell>{name}</TableCell>
      <TableCell>
        {props.canEdit ? (
          <ConfirmActionButton
            label="Retirar"
            title={`Retirar el vínculo con ${name}`}
            description="El documento deja de aparecer ligado a este registro. Puede volver a vincularlo."
            confirmLabel="Sí, retirar"
            disabled={remove.pending}
            onConfirm={() => {
              remove.execute(link.id);
            }}
          />
        ) : null}
        {remove.error === null ? null : <FormError error={remove.error} />}
        {remove.dialog}
      </TableCell>
    </TableRow>
  );
}

export function DocumentLinks({ documentId }: { readonly documentId: string }): JSX.Element {
  const links = useDocumentLinks(documentId);
  const canEdit = usePermissions().can('doc.document.update');
  return (
    <div className="flex flex-col gap-4">
      {canEdit ? (
        <RecordDialog
          triggerLabel="Vincular"
          variant="outline"
          title="Vincular el documento"
          description="Con un cargo, un proceso o un tercero."
        >
          {(close) => <LinkForm documentId={documentId} onSaved={close} />}
        </RecordDialog>
      ) : null}
      <QueryState query={links} loadingLabel="Cargando los vínculos">
        {(data) =>
          data.data.length === 0 ? (
            <EmptyState
              icon={<Link2 />}
              title="Sin vínculos"
              description="Aquí aparecerán los cargos, procesos y terceros ligados al documento."
            />
          ) : (
            <SimpleTable headers={['Relación', 'Tipo', 'Registro', 'Acciones']}>
              {data.data.map((link) => (
                <LinkRow key={link.id} documentId={documentId} link={link} canEdit={canEdit} />
              ))}
            </SimpleTable>
          )
        }
      </QueryState>
    </div>
  );
}
