'use client';

import {
  IN_FORCE_STATUSES,
  downloadLinkResponseSchema,
  type ContractDetail,
  type ContractDocument,
  type PermissionCode,
} from '@arza/contracts';
import { Button, buttonVariants } from '@arza/ui';
import Link from 'next/link';
import type { JSX } from 'react';

import { CodeConfirmation } from '../../components/code-confirmation';
import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { save } from '../audit/audit-export-button';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { ApproveForm, NoteForm } from './decision-forms';
import { CONTRACT_PATHS } from './labels';
import { useContractAction } from './queries';
import { SignatureForm } from './signature-form';

// Acciones del contrato (B24, ficha 17.7), según su estado y los permisos de la persona. La API
// vuelve a revisar cada paso: solo un borrador se edita, solo la Dirección aprueba, termina y
// prorroga, y quien elaboró el contrato no lo aprueba.

interface Props {
  readonly contract: ContractDetail;
}

function useStep(contract: ContractDetail, action: string, onDone?: () => void) {
  const api = useApiClient();
  return useContractAction<object>(
    (body, csrfToken) =>
      api.post(`/v1/contracts/${contract.id}/actions/${action}`, {
        body,
        version: contract.version,
        csrfToken,
      }),
    onDone,
  );
}

function SubmitContract({ contract }: Props): JSX.Element {
  const submit = useStep(contract, 'submit');
  return (
    <>
      <Button
        type="button"
        disabled={submit.pending}
        onClick={() => {
          submit.execute({});
        }}
      >
        Pedir la revisión
      </Button>
      {submit.error === null ? null : <FormError error={submit.error} />}
      {submit.dialog}
    </>
  );
}

function StepDialog(props: {
  readonly contract: ContractDetail;
  readonly label: string;
  readonly description: string;
  readonly primary?: boolean;
  readonly children: (close: () => void) => JSX.Element;
}): JSX.Element {
  return (
    <RecordDialog
      triggerLabel={props.label}
      variant={props.primary === true ? 'primary' : 'outline'}
      title={`${props.label}: ${props.contract.code}`}
      description={props.description}
    >
      {props.children}
    </RecordDialog>
  );
}

function ApproveDialog({ contract }: Props): JSX.Element {
  return (
    <StepDialog
      contract={contract}
      label="Aprobar"
      primary
      description="Al aprobarlo se genera el PDF definitivo y el contrato ya no cambia."
    >
      {(close) => <ApproveAction contract={contract} onDone={close} />}
    </StepDialog>
  );
}

function ApproveAction(props: Props & { readonly onDone: () => void }): JSX.Element {
  const approve = useStep(props.contract, 'approve', props.onDone);
  return <ApproveForm contract={props.contract} action={approve} />;
}

function NoteAction(props: {
  readonly contract: ContractDetail;
  readonly action: string;
  readonly path?: string;
  readonly onDone: () => void;
  readonly spec: Parameters<typeof NoteForm>[0]['spec'];
}): JSX.Element {
  const api = useApiClient();
  const step = useContractAction<object>(
    (body, csrfToken) =>
      api.post(props.path ?? `/v1/contracts/${props.contract.id}/actions/${props.action}`, {
        body,
        version: props.contract.version,
        csrfToken,
      }),
    props.onDone,
  );
  return <NoteForm spec={props.spec} action={step} />;
}

function SignatureAction(props: Props & { readonly onDone: () => void }): JSX.Element {
  const register = useStep(props.contract, 'register-signature', props.onDone);
  return <SignatureForm action={register} />;
}

function Download(props: Props & { readonly document: ContractDocument; readonly label: string }) {
  const api = useApiClient();
  const { contract } = props;
  const download = useContractAction<undefined>(async (_args, csrfToken) => {
    const link = await api.post(`/v1/contracts/${contract.id}/pdf`, {
      body: { document: props.document },
      schema: downloadLinkResponseSchema,
      csrfToken,
    });
    const content = await api.fetchFile(link.url);
    const fileName =
      props.document === 'signed'
        ? (contract.signed?.file.file_name ?? `${contract.code}-firmado.pdf`)
        : (contract.pdf.file_name ?? `${contract.code}.pdf`);
    save({ fileName, content });
  });
  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={download.pending}
        onClick={() => {
          download.execute(undefined);
        }}
      >
        {props.label}
      </Button>
      {download.error === null ? null : <FormError error={download.error} />}
      {download.dialog}
    </>
  );
}

function ReviewActions({ contract }: Props): JSX.Element {
  return (
    <>
      <ApproveDialog contract={contract} />
      <StepDialog
        contract={contract}
        label="Devolver para corregir"
        description="Vuelve a borrador con su comentario."
      >
        {(close) => (
          <NoteAction
            contract={contract}
            action="return"
            onDone={close}
            spec={{
              idPrefix: 'devolver',
              textField: 'comment',
              textLabel: 'Qué debe corregirse',
              submitLabel: 'Devolver',
              pendingLabel: 'Devolviendo…',
            }}
          />
        )}
      </StepDialog>
    </>
  );
}

const RENEW_SPEC = {
  idPrefix: 'prorrogar',
  textField: 'summary',
  textLabel: 'Por qué se prorroga',
  dateField: 'new_ends_on',
  dateLabel: 'Nueva fecha de fin',
  submitLabel: 'Prorrogar',
  pendingLabel: 'Prorrogando…',
};

const TERMINATE_SPEC = {
  idPrefix: 'terminar',
  textField: 'reason',
  textLabel: 'Motivo de la terminación',
  dateField: 'terminated_on',
  dateLabel: 'Fecha de terminación',
  submitLabel: 'Terminar',
  pendingLabel: 'Terminando…',
};

function RenewDialog({ contract }: Props): JSX.Element {
  return (
    <StepDialog
      contract={contract}
      label="Prorrogar"
      description="Se crea la prórroga aprobada con la nueva fecha de fin. Rige al registrar su copia firmada."
    >
      {(close) => (
        <NoteAction contract={contract} action="renew" onDone={close} spec={RENEW_SPEC} />
      )}
    </StepDialog>
  );
}

function TerminateDialog({ contract }: Props): JSX.Element {
  return (
    <StepDialog
      contract={contract}
      label="Terminar"
      description="Terminación anticipada. El contrato queda terminado desde la fecha que indique."
    >
      {(close) => (
        <CodeConfirmation code={contract.code}>
          <NoteAction contract={contract} action="terminate" onDone={close} spec={TERMINATE_SPEC} />
        </CodeConfirmation>
      )}
    </StepDialog>
  );
}

function SignatureDialog({ contract }: Props): JSX.Element {
  return (
    <StepDialog
      contract={contract}
      label="Registrar la firma"
      primary
      description="Suba la copia del PDF aprobado firmada por todos. El contrato quedará vigente."
    >
      {(close) => <SignatureAction contract={contract} onDone={close} />}
    </StepDialog>
  );
}

type Allowed = (code: PermissionCode) => boolean;

/** Lo que se hace mientras se elabora y se revisa. */
function workActions(contract: ContractDetail, allowed: Allowed): JSX.Element[] {
  const actions: JSX.Element[] = [];
  if (contract.status === 'draft' && allowed('contract.update')) {
    const edit = buttonVariants({ variant: 'outline' });
    actions.push(
      <Link key="editar" href={CONTRACT_PATHS.edit(contract.id)} className={edit}>
        Editar
      </Link>,
      <SubmitContract key="revision" contract={contract} />,
    );
  }
  if (contract.status === 'in_review' && allowed('contract.approve')) {
    actions.push(<ReviewActions key="direccion" contract={contract} />);
  }
  const ready = contract.pdf.status === 'ready';
  if (contract.status === 'approved' && ready && allowed('contract.update')) {
    actions.push(<SignatureDialog key="firma" contract={contract} />);
  }
  return actions;
}

/** Lo que se hace con un contrato vigente y los PDF para descargar. */
function inForceActions(contract: ContractDetail, allowed: Allowed): JSX.Element[] {
  const actions: JSX.Element[] = [];
  if (IN_FORCE_STATUSES.includes(contract.status)) {
    if (allowed('contract.renew'))
      actions.push(<RenewDialog key="prorrogar" contract={contract} />);
    if (allowed('contract.terminate')) {
      actions.push(<TerminateDialog key="terminar" contract={contract} />);
    }
  }
  if (contract.pdf.status === 'ready') {
    actions.push(
      <Download key="pdf" contract={contract} document="generated" label="Descargar PDF" />,
    );
  }
  if (contract.signed !== null) {
    const label = 'Descargar la copia firmada';
    actions.push(<Download key="firmado" contract={contract} document="signed" label={label} />);
  }
  return actions;
}

export function ContractActions({ contract }: Props): JSX.Element | null {
  const { can } = usePermissions();
  const actions = [...workActions(contract, can), ...inForceActions(contract, can)];
  if (actions.length === 0) return null;
  return <div className="flex flex-wrap items-start gap-3">{actions}</div>;
}
