'use client';

import {
  AUTHOR_SUPPORTS,
  addIpAuthorSchema,
  innCreatedResponseSchema,
  type AuthorSupport,
  type IpAssetDetail,
  type IpAuthor,
} from '@arza/contracts';
import { FormField, SelectField } from '@arza/ui';
import { useCallback, useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { NewRecord } from '../finance/ledger-ui';
import { HrActionButton, HrList, HrSection, optionsOf, orNull } from '../hr/hr-dialog';
import { useHrAction } from '../hr/hr-queries';
import { usePermissions } from '../session/permissions';
import { EvidencePicker, type EvidenceState } from '../sst/evidence-picker';
import { FormProblem } from '../sst/form-problem';
import { assetAsBody } from './ip-asset-form';
import { INN_REFRESH, useInnPeople } from './innovation-queries';

// Cadena de titularidad (B40, decisión 8): cada autor con el soporte escrito de su cesión. Una
// persona de la empresa usa su contrato laboral firmado; un externo, un contrato de Contratos por
// su código o el documento de cesión firmado (PDF). También se adjunta aquí el certificado.

const PDF = 'application/pdf';
const NO_FILE: EvidenceState = { fileId: null, busy: false };

function text(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}

function authorInput(form: FormData, support: AuthorSupport, fileId: string | null) {
  return {
    user_id: orNull(text(form, 'user_id')),
    name: orNull(text(form, 'name')),
    contribution: orNull(text(form, 'contribution')),
    support_kind: support,
    contract_code: support === 'contract' ? orNull(text(form, 'contract_code')) : null,
    support_file_id: support === 'document' ? fileId : null,
  };
}

/** Un archivo que se sube y queda disponible antes de enviar el formulario. */
function useFile(): [EvidenceState, (state: EvidenceState) => void] {
  const [file, setFile] = useState<EvidenceState>(NO_FILE);
  const onFile = useCallback((state: EvidenceState) => {
    setFile(state);
  }, []);
  return [file, onFile];
}

function useAddAuthor(asset: IpAssetDetail, onDone: () => void) {
  const api = useApiClient();
  return useHrAction(
    (body: object, csrfToken: string) =>
      api.post(`/v1/innovation/ip-assets/${asset.id}/authors`, {
        body,
        csrfToken,
        schema: innCreatedResponseSchema,
      }),
    onDone,
    INN_REFRESH,
  );
}

function SupportFields(props: {
  readonly support: AuthorSupport;
  readonly onSupport: (support: AuthorSupport) => void;
  readonly onFile: (state: EvidenceState) => void;
}): JSX.Element {
  return (
    <>
      <SelectField
        id="autor-soporte"
        name="support_kind"
        label="Soporte de la cesión"
        options={optionsOf(AUTHOR_SUPPORTS)}
        value={props.support}
        onChange={(event) => {
          props.onSupport(event.target.value as AuthorSupport);
        }}
      />
      {props.support === 'contract' ? (
        <FormField id="autor-contrato" name="contract_code" label="Código del contrato" />
      ) : null}
      {props.support === 'document' ? (
        <EvidencePicker
          id="autor-cesion"
          label="Cesión firmada (PDF)"
          accept={PDF}
          onChange={props.onFile}
        />
      ) : null}
    </>
  );
}

function AuthorForm(props: { readonly asset: IpAssetDetail; readonly onDone: () => void }) {
  const people = useInnPeople();
  const [support, setSupport] = useState<AuthorSupport>('employment_contract');
  const [file, onFile] = useFile();
  const [problem, setProblem] = useState<string | null>(null);
  const action = useAddAuthor(props.asset, props.onDone);
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input = authorInput(new FormData(event.currentTarget), support, file.fileId);
    const parsed = addIpAuthorSchema.safeParse(input);
    setProblem(parsed.success ? null : (parsed.error.issues[0]?.message ?? 'Revise los datos.'));
    if (parsed.success) action.execute(parsed.data);
  };
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={submit}>
      <SelectField
        id="autor-persona"
        name="user_id"
        label="Persona de la empresa"
        options={[{ value: '', label: 'Es un autor externo' }, ...people]}
      />
      <FormField id="autor-nombre" name="name" label="Nombre del autor externo" />
      <FormField id="autor-aporte" name="contribution" label="Aporte (opcional)" />
      <SupportFields support={support} onSupport={setSupport} onFile={onFile} />
      <FormProblem text={problem} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Agregar autor"
        pendingLabel="Guardando…"
        pending={action.pending || file.busy}
      />
    </form>
  );
}

function CertificateForm(props: { readonly asset: IpAssetDetail; readonly onDone: () => void }) {
  const api = useApiClient();
  const [file, onFile] = useFile();
  const [problem, setProblem] = useState<string | null>(null);
  const action = useHrAction(
    (fileId: string, csrfToken: string) =>
      api.patch(`/v1/innovation/ip-assets/${props.asset.id}`, {
        body: assetAsBody(props.asset, fileId),
        csrfToken,
        version: props.asset.version,
      }),
    props.onDone,
    INN_REFRESH,
  );
  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProblem(file.fileId === null ? 'Adjunte el certificado ya disponible.' : null);
    if (file.fileId !== null) action.execute(file.fileId);
  };
  return (
    <form noValidate className="flex flex-col gap-3" onSubmit={submit}>
      <EvidencePicker id="certificado" label="Certificado (PDF)" accept={PDF} onChange={onFile} />
      <FormProblem text={problem} />
      {action.error === null ? null : <FormError error={action.error} />}
      <SubmitButton
        label="Adjuntar"
        pendingLabel="Guardando…"
        pending={action.pending || file.busy}
      />
    </form>
  );
}

function AuthorActions({ asset }: { readonly asset: IpAssetDetail }): JSX.Element {
  const { canAll } = usePermissions();
  const manages = canAll('inn.ip.manage');
  return (
    <div className="flex flex-wrap gap-3">
      <NewRecord
        allowed={manages}
        label="Agregar autor"
        title={`Agregar un autor a ${asset.code}`}
        description="Cada autor necesita el soporte escrito de la cesión de sus derechos patrimoniales."
      >
        {(close) => <AuthorForm asset={asset} onDone={close} />}
      </NewRecord>
      <NewRecord
        allowed={manages}
        variant="outline"
        label={asset.certificate === null ? 'Adjuntar certificado' : 'Cambiar certificado'}
        title={`Certificado de ${asset.code}`}
        description="Suba el certificado o la resolución de registro en PDF."
      >
        {(close) => <CertificateForm asset={asset} onDone={close} />}
      </NewRecord>
    </div>
  );
}

function AuthorRow(props: { readonly assetId: string; readonly author: IpAuthor }) {
  const api = useApiClient();
  const { canAll } = usePermissions();
  const { author } = props;
  return (
    <>
      <span className="flex flex-col">
        <strong>{author.name}</strong>
        <span className="text-muted-foreground">
          {AUTHOR_SUPPORTS[author.support_kind]}: {author.support_label}
          {author.contribution === null ? '' : ` · ${author.contribution}`}
        </span>
      </span>
      {canAll('inn.ip.manage') ? (
        <HrActionButton
          label="Quitar"
          pendingLabel="Quitando…"
          ariaLabel={`Quitar a ${author.name} de los autores`}
          run={(csrfToken) =>
            api.delete(`/v1/innovation/ip-assets/${props.assetId}/authors/${author.id}`, {
              csrfToken,
            })
          }
          refresh={INN_REFRESH}
        />
      ) : null}
    </>
  );
}

export function AuthorsSection({ asset }: { readonly asset: IpAssetDetail }): JSX.Element {
  return (
    <HrSection id="autores" title="Cadena de titularidad">
      <AuthorActions asset={asset} />
      <HrList
        items={asset.authors}
        empty="Aún no hay autores registrados."
        keyOf={(author) => author.id}
        render={(author) => <AuthorRow assetId={asset.id} author={author} />}
      />
    </HrSection>
  );
}
