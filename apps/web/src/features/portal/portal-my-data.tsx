'use client';

import { PORTAL_ROLE_LABELS, portalDataExportSchema, type PortalMyData } from '@arza/contracts';
import { Button, Card, CardContent, FormField } from '@arza/ui';
import { useState, type JSX, type SubmitEvent } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { save } from '../audit/audit-export-button';
import { Fact } from './portal-bits';
import { usePortalAction, usePortalMyData } from './portal-queries';

// Mis datos y privacidad (B30, ficha 17.10; Ley 1581, art. 8): la persona consulta lo que la
// plataforma guarda de ella, corrige su nombre y descarga una copia. La descarga queda registrada.
// Las demás solicitudes sobre sus datos se hacen como PQRSF de datos personales (Soporte).

function NameForm({ data }: { readonly data: PortalMyData }): JSX.Element {
  const api = useApiClient();
  const [name, setName] = useState(data.display_name ?? '');
  const [problem, setProblem] = useState<string | null>(null);
  const rename = usePortalAction<string>(async (displayName, csrfToken) => {
    await api.put('/v1/portal/me', {
      body: { display_name: displayName },
      version: data.version,
      csrfToken,
    });
  });
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const short = name.trim().length < 3;
    setProblem(short ? 'Escriba su nombre.' : null);
    if (!short) rename.execute(name.trim());
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-3">
      <FormField
        id="mis-datos-nombre"
        label="Su nombre"
        value={name}
        error={problem}
        onChange={(event) => {
          setName(event.target.value);
        }}
      />
      {rename.error === null ? null : <FormError error={rename.error} />}
      <div>
        <Button type="submit" disabled={rename.pending}>
          {rename.pending ? 'Guardando…' : 'Guardar'}
        </Button>
      </div>
      {rename.dialog}
    </form>
  );
}

function ExportButton(): JSX.Element {
  const api = useApiClient();
  const download = usePortalAction<undefined>(async (_args, csrfToken) => {
    const copy = await api.post('/v1/portal/me/export', {
      body: {},
      schema: portalDataExportSchema,
      csrfToken,
    });
    const content = new Blob([JSON.stringify(copy, null, 2)], { type: 'application/json' });
    save({ fileName: 'mis-datos-arza-one.json', content });
  });
  return (
    <div className="flex flex-col gap-2">
      {download.error === null ? null : <FormError error={download.error} />}
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={download.pending}
          onClick={() => {
            download.execute(undefined);
          }}
        >
          {download.pending ? 'Preparando…' : 'Descargar mis datos'}
        </Button>
      </div>
      {download.dialog}
    </div>
  );
}

function MyDataView({ data }: { readonly data: PortalMyData }): JSX.Element {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card>
        <CardContent className="flex flex-col gap-2 p-4">
          <h2 className="font-heading text-lg font-semibold">Lo que guardamos de usted</h2>
          <Fact label="Correo">{data.email}</Fact>
          <Fact label="Empresa">{data.company ?? '—'}</Fact>
          <Fact label="Rol">{data.role === null ? '—' : PORTAL_ROLE_LABELS[data.role]}</Fact>
          <Fact label="Segundo factor">{data.second_factor ? 'Exigido' : 'Opcional'}</Fact>
          <Fact label="Cuenta creada">{formatDateTime(data.created_at)}</Fact>
          <Fact label="Último ingreso">
            {data.last_login_at === null ? '—' : formatDateTime(data.last_login_at)}
          </Fact>
          <Fact label="Términos aceptados">
            {data.terms_accepted_at === null ? '—' : formatDateTime(data.terms_accepted_at)}
          </Fact>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4">
          <h2 className="font-heading text-lg font-semibold">Corregir y descargar</h2>
          <NameForm data={data} />
          <p className="text-sm text-muted-foreground">
            Descargue una copia de lo que la plataforma guarda de usted. Para corregir su correo o
            pedir que borremos sus datos, radique una PQRSF de datos personales en Soporte.
          </p>
          <ExportButton />
        </CardContent>
      </Card>
    </div>
  );
}

export function PortalMyDataPage(): JSX.Element {
  const data = usePortalMyData();
  return (
    <>
      <PageHeader title="Mis datos" description="Sus datos, su copia y la privacidad." />
      <QueryState query={data} loadingLabel="Cargando sus datos">
        {(value) => <MyDataView data={value} />}
      </QueryState>
    </>
  );
}
