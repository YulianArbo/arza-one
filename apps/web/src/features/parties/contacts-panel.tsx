'use client';

import { createdResponseSchema, type Contact, type PartyDetail } from '@arza/contracts';
import {
  Badge,
  DialogFooter,
  EmptyState,
  SelectField,
  SimpleTable,
  TableCell,
  TableRow,
} from '@arza/ui';
import { Contact as ContactIcon } from 'lucide-react';
import Link from 'next/link';
import { useState, type JSX, type SubmitEvent } from 'react';

import { ConfirmActionButton } from '../../components/confirm-action-button';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { CheckboxField, RecordDialog, TextInput } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { identification, partyPath } from './labels';
import { PARTY_KEYS, useContacts, useParties } from './queries';

// Contactos y firmantes autorizados de una organización (ficha 17.3). En una persona se ven las
// organizaciones donde es contacto.

const REASON = 'Los contactos del tercero quedan en la auditoría.';

interface ContactValues {
  readonly personId: string;
  readonly jobTitle: string;
  readonly isPrimary: boolean;
  readonly canSign: boolean;
}

function useSaveContact(organizationId: string, contact: Contact | null, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<ContactValues, unknown>({
    run: (v, csrfToken) => {
      const fields = {
        job_title: v.jobTitle.trim() === '' ? null : v.jobTitle.trim(),
        is_primary: v.isPrimary,
        can_sign: v.canSign,
      };
      const path = `/v1/parties/${organizationId}/contacts`;
      if (contact === null) {
        const body = { person_id: v.personId, ...fields };
        return api.post(path, { body, schema: createdResponseSchema, csrfToken });
      }
      const options = { body: fields, version: contact.version, csrfToken };
      return api.patch(`${path}/${contact.id}`, options);
    },
    invalidate: [PARTY_KEYS.all],
    onSuccess: onSaved,
    reason: REASON,
  });
}

/** Busca entre los terceros que son personas. */
function PersonPicker(props: { readonly value: string; readonly onChange: (id: string) => void }) {
  const [q, setQ] = useState('');
  const found = useParties({ q, role: '', status: '' }, null).data?.data ?? [];
  const people = found.filter((party) => party.kind === 'person');
  return (
    <>
      <TextInput
        id="contacto-buscar"
        label="Buscar la persona"
        hint="Por nombre o documento. Si no aparece, regístrela primero como tercero."
        value={q}
        onValue={setQ}
      />
      <SelectField
        id="contacto-persona"
        label="Persona"
        options={[
          { value: '', label: people.length === 0 ? 'Sin resultados' : 'Elija la persona' },
          ...people.map((p) => ({ value: p.id, label: `${p.name} · ${identification(p)}` })),
        ]}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
    </>
  );
}

function ContactMarks(props: {
  readonly values: ContactValues;
  readonly onChange: (values: ContactValues) => void;
}) {
  const { values, onChange } = props;
  return (
    <>
      <CheckboxField
        id="contacto-principal"
        label="Contacto principal"
        hint="Solo hay uno: marcarlo desmarca al anterior."
        checked={values.isPrimary}
        onChange={(isPrimary) => {
          onChange({ ...values, isPrimary });
        }}
      />
      <CheckboxField
        id="contacto-firma"
        label="Firmante autorizado"
        checked={values.canSign}
        onChange={(canSign) => {
          onChange({ ...values, canSign });
        }}
      />
    </>
  );
}

function ContactForm(props: {
  readonly organizationId: string;
  readonly contact: Contact | null;
  readonly onSaved: () => void;
}): JSX.Element {
  const { contact } = props;
  const [values, setValues] = useState<ContactValues>({
    personId: contact?.person.id ?? '',
    jobTitle: contact?.job_title ?? '',
    isPrimary: contact?.is_primary ?? false,
    canSign: contact?.can_sign ?? false,
  });
  const save = useSaveContact(props.organizationId, contact, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  const choose = (personId: string): void => {
    setValues({ ...values, personId });
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      {contact === null ? <PersonPicker value={values.personId} onChange={choose} /> : null}
      <TextInput
        id="contacto-cargo"
        label="Cargo (opcional)"
        value={values.jobTitle}
        onValue={(jobTitle) => {
          setValues({ ...values, jobTitle });
        }}
      />
      <ContactMarks values={values} onChange={setValues} />
      <DialogFooter>
        <SubmitButton label="Guardar" pendingLabel="Guardando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function useRemoveContact(organizationId: string) {
  const api = useApiClient();
  return useAdminAction<Contact>({
    run: (contact, csrfToken) =>
      api.delete(`/v1/parties/${organizationId}/contacts/${contact.id}`, {
        version: contact.version,
        csrfToken,
      }),
    invalidate: [PARTY_KEYS.all],
    reason: REASON,
  });
}

interface RowProps {
  readonly contact: Contact;
  readonly party: PartyDetail;
  /** Editar y retirar; solo en la ficha de la organización y con permiso. */
  readonly onRemove: ((contact: Contact) => void) | null;
}

function ContactActions(props: {
  readonly contact: Contact;
  readonly organizationId: string;
  readonly onRemove: (contact: Contact) => void;
}) {
  const name = props.contact.person.name;
  return (
    <>
      <RecordDialog
        triggerLabel="Editar"
        triggerAriaLabel={`Editar el contacto ${name}`}
        variant="outline"
        title={`Editar el contacto ${name}`}
        description="Cambie el cargo, si es el principal o si firma."
      >
        {(close) => (
          <ContactForm
            organizationId={props.organizationId}
            contact={props.contact}
            onSaved={close}
          />
        )}
      </RecordDialog>
      <ConfirmActionButton
        size="sm"
        label="Retirar"
        title={`¿Retirar a ${name} como contacto?`}
        description="Deja de aparecer como contacto. Queda en la auditoría."
        confirmLabel="Sí, retirar"
        disabled={false}
        onConfirm={() => {
          props.onRemove(props.contact);
        }}
      />
    </>
  );
}

function ContactRow({ contact, party, onRemove }: RowProps): JSX.Element {
  const other = party.kind === 'organization' ? contact.person : contact.organization;
  const reach = [contact.person.email, contact.person.phone].filter(Boolean).join(' · ');
  return (
    <TableRow>
      <TableCell>
        <Link href={partyPath(other.id)} className="font-medium text-primary hover:underline">
          {other.name}
        </Link>
        {party.kind === 'organization' ? (
          <p className="text-xs text-muted-foreground">{reach || 'Sin correo ni teléfono'}</p>
        ) : null}
      </TableCell>
      <TableCell>{contact.job_title ?? '—'}</TableCell>
      <TableCell className="flex flex-wrap gap-1">
        {contact.is_primary ? <Badge tone="info">Principal</Badge> : null}
        {contact.can_sign ? <Badge tone="success">Firma</Badge> : null}
      </TableCell>
      <TableCell className="flex gap-2">
        {onRemove === null ? null : (
          <ContactActions contact={contact} organizationId={party.id} onRemove={onRemove} />
        )}
      </TableCell>
    </TableRow>
  );
}

function ContactTable(
  props: Omit<RowProps, 'contact'> & { readonly contacts: readonly Contact[] },
) {
  const organization = props.party.kind === 'organization';
  if (props.contacts.length === 0) {
    return (
      <EmptyState
        icon={<ContactIcon />}
        title={organization ? 'Todavía no hay contactos' : 'No es contacto de ninguna organización'}
        description={
          organization
            ? 'Agregue las personas con quienes trata y quiénes firman por la organización.'
            : 'Cuando una organización la agregue como contacto, aparecerá aquí.'
        }
      />
    );
  }
  return (
    <SimpleTable headers={[organization ? 'Persona' : 'Organización', 'Cargo', 'Marcas', '']}>
      {props.contacts.map((contact) => (
        <ContactRow key={contact.id} {...props} contact={contact} />
      ))}
    </SimpleTable>
  );
}

export function ContactsPanel({ party }: { readonly party: PartyDetail }): JSX.Element {
  const contacts = useContacts(party.id);
  const canUpdate = usePermissions().can('party.update') && party.kind === 'organization';
  const remove = useRemoveContact(party.id);
  return (
    <div className="flex flex-col gap-4">
      {canUpdate ? (
        <div>
          <RecordDialog
            triggerLabel="Agregar un contacto"
            title={`Agregar un contacto de ${party.name}`}
            description="La persona debe estar registrada como tercero."
          >
            {(close) => <ContactForm organizationId={party.id} contact={null} onSaved={close} />}
          </RecordDialog>
        </div>
      ) : null}
      {remove.error === null ? null : <FormError error={remove.error} />}
      <QueryState query={contacts} loadingLabel="Cargando los contactos">
        {({ data }) => (
          <ContactTable
            contacts={data}
            party={party}
            onRemove={canUpdate ? remove.execute : null}
          />
        )}
      </QueryState>
      {remove.dialog}
    </div>
  );
}
