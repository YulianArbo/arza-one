'use client';

import {
  CONTRACT_KINDS,
  portalSigningLinkSchema,
  type PortalContract,
  type PortalSignature,
} from '@arza/contracts';
import { Button, Card, CardContent, EmptyState } from '@arza/ui';
import { FileSignature, FileText } from 'lucide-react';
import type { JSX } from 'react';

import { PageHeader } from '../../components/app-shell/page-header';
import { useApiClient } from '../../lib/api/api-provider';
import { formatDate } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { QueryState } from '../administration/query-state';
import { formatPesos } from '../crm/labels';
import {
  CONTRACT_STATUSES,
  ENVELOPE_STATUSES,
  Fact,
  PORTAL_SIGNABLE_LABELS,
  StatusBadge,
  signatureLine,
} from './portal-bits';
import {
  usePortalAction,
  usePortalContracts,
  usePortalDownload,
  usePortalSignatures,
} from './portal-queries';

// Por aprobar y Contratos y firmas (B30, decisiones 4 y 6). Aprobar un entregable es firmar su acta
// de entrega; firmar desde el portal abre la misma pantalla de firma de siempre con un enlace nuevo
// de un solo uso, que pide el código enviado a su correo (el enlace del correo anterior deja de
// servir). Los contratos se ven desde que se envían a firma.

/** Pide el enlace nuevo y abre la pantalla de firma. */
function SignButton({ signature }: { readonly signature: PortalSignature }): JSX.Element {
  const api = useApiClient();
  const open = usePortalAction<string, string>(
    async (id, csrfToken) =>
      (
        await api.post(`/v1/portal/signatures/${id}/link`, {
          body: {},
          schema: portalSigningLinkSchema,
          csrfToken,
        })
      ).url,
    (url) => {
      window.location.assign(url);
    },
  );
  return (
    <div className="flex flex-col gap-2">
      {open.error === null ? null : <FormError error={open.error} />}
      <div>
        <Button
          type="button"
          disabled={open.pending}
          onClick={() => {
            open.execute(signature.id);
          }}
        >
          {open.pending ? 'Abriendo…' : 'Revisar y firmar'}
        </Button>
      </div>
      {open.dialog}
    </div>
  );
}

function waitingText(signature: PortalSignature): string {
  if (signature.can_sign) return '';
  if (signature.my_turn)
    return 'Le toca firmar, pero su rol no le permite hacerlo desde el portal.';
  return 'Espera la firma de otra persona.';
}

function SignatureCard({ signature }: { readonly signature: PortalSignature }): JSX.Element {
  const waiting = waitingText(signature);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-heading font-semibold">
            {signature.document_title}
            <span className="block text-sm font-normal text-muted-foreground">
              {PORTAL_SIGNABLE_LABELS[signature.kind]} · {signature.document_code}
            </span>
          </h3>
          <StatusBadge status={signature.status} labels={ENVELOPE_STATUSES} />
        </div>
        <p className="text-sm text-muted-foreground">{signatureLine(signature)}</p>
        {signature.status === 'sent' && signature.can_sign ? (
          <SignButton signature={signature} />
        ) : null}
        {signature.status === 'sent' && waiting !== '' ? (
          <p className="text-sm">{waiting}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}

function SignatureList(props: {
  readonly items: readonly PortalSignature[];
  readonly label: string;
  readonly empty: string;
}): JSX.Element {
  if (props.items.length === 0) {
    return (
      <EmptyState
        icon={<FileSignature />}
        title={props.empty}
        description="Cuando haya algo por firmar, lo verá aquí y le llegará un aviso a su correo."
      />
    );
  }
  return (
    <ul className="grid gap-3 md:grid-cols-2" aria-label={props.label}>
      {props.items.map((signature) => (
        <li key={signature.id}>
          <SignatureCard signature={signature} />
        </li>
      ))}
    </ul>
  );
}

export function PortalApprovalsPage(): JSX.Element {
  const signatures = usePortalSignatures();
  return (
    <>
      <PageHeader
        title="Por aprobar"
        description="Aprobar un entregable es firmar su acta de entrega. Le pediremos un código que llega a su correo."
      />
      <QueryState query={signatures} loadingLabel="Cargando lo que espera su aprobación">
        {(data) => (
          <SignatureList
            items={data.pending.filter((row) => row.kind === 'acceptance')}
            label="Actas por aprobar"
            empty="No hay actas que esperen su aprobación"
          />
        )}
      </QueryState>
    </>
  );
}

function DownloadSigned({ contract }: { readonly contract: PortalContract }): JSX.Element {
  const download = usePortalDownload();
  return (
    <div className="flex flex-col gap-2">
      {download.error === null ? null : <FormError error={download.error} />}
      <div>
        <Button
          type="button"
          variant="outline"
          disabled={download.pending}
          onClick={() => {
            download.execute({
              path: `/v1/portal/contracts/${contract.id}/link`,
              fileName: `${contract.code}-firmado.pdf`,
            });
          }}
        >
          {download.pending ? 'Preparando…' : 'Descargar firmado'}
        </Button>
      </div>
      {download.dialog}
    </div>
  );
}

function ContractCard({ contract }: { readonly contract: PortalContract }): JSX.Element {
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h3 className="font-heading font-semibold">
            {contract.title}
            <span className="block text-sm font-normal text-muted-foreground">
              {CONTRACT_KINDS[contract.kind]} · {contract.code}
            </span>
          </h3>
          <StatusBadge status={contract.status} labels={CONTRACT_STATUSES} />
        </div>
        <Fact label="Vigencia">
          {formatDate(contract.starts_on)} a {formatDate(contract.ends_on)}
        </Fact>
        {contract.value === null ? null : <Fact label="Valor">{formatPesos(contract.value)}</Fact>}
        {contract.has_signed_copy ? <DownloadSigned contract={contract} /> : null}
      </CardContent>
    </Card>
  );
}

function Contracts(): JSX.Element {
  const contracts = usePortalContracts();
  return (
    <QueryState query={contracts} loadingLabel="Cargando sus contratos">
      {(data) =>
        data.data.length === 0 ? (
          <EmptyState
            icon={<FileText />}
            title="Aún no hay contratos para mostrar"
            description="Verá sus contratos desde que se envíen a firma."
          />
        ) : (
          <ul className="grid gap-3 md:grid-cols-2" aria-label="Contratos">
            {data.data.map((contract) => (
              <li key={contract.id}>
                <ContractCard contract={contract} />
              </li>
            ))}
          </ul>
        )
      }
    </QueryState>
  );
}

export function PortalSignaturesPage(): JSX.Element {
  const signatures = usePortalSignatures();
  return (
    <>
      <PageHeader
        title="Contratos y firmas"
        description="Sus contratos y lo que requiere su firma."
      />
      <section className="flex flex-col gap-3" aria-labelledby="por-firmar">
        <h2 id="por-firmar" className="font-heading text-lg font-semibold">
          Por firmar
        </h2>
        <QueryState query={signatures} loadingLabel="Cargando lo que requiere su firma">
          {(data) => (
            <SignatureList
              items={data.pending.filter((row) => row.kind !== 'acceptance')}
              label="Documentos por firmar"
              empty="No hay documentos que esperen su firma"
            />
          )}
        </QueryState>
      </section>
      <section className="flex flex-col gap-3" aria-labelledby="contratos">
        <h2 id="contratos" className="font-heading text-lg font-semibold">
          Contratos
        </h2>
        <Contracts />
      </section>
    </>
  );
}
