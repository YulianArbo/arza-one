'use client';

import {
  createdResponseSchema,
  riskLevelSchema,
  type DueDiligence,
  type PartyDetail,
  type RiskLevel,
} from '@arza/contracts';
import {
  Badge,
  Card,
  CardContent,
  DialogFooter,
  EmptyState,
  Label,
  SelectField,
  Textarea,
} from '@arza/ui';
import { ClipboardCheck } from 'lucide-react';
import { useState, type JSX, type SubmitEvent } from 'react';

import { useApiClient } from '../../lib/api/api-provider';
import { formatDate, formatDateTime } from '../../lib/format/date-time';
import { FormError } from '../access/form-alert';
import { SubmitButton } from '../access/submit-button';
import { useAdminAction } from '../administration/admin-action';
import { QueryState } from '../administration/query-state';
import { RecordDialog } from '../organization/record-dialog';
import { usePermissions } from '../session/permissions';
import { useSession } from '../session/session-provider';
import { REVIEW_STATUS_LABELS, RISK_LABELS, RISK_TONES, optionsFrom } from './labels';
import { PARTY_KEYS, useDueDiligence } from './queries';
import { ReviewButtons } from './review-buttons';

// Conocimiento del tercero y nivel de riesgo (ficha 17.3, FT-FIN-007 en versión mínima). Lo
// aprueba Dirección, nunca quien lo registró; la aprobación vale doce meses.

const REASON = 'El conocimiento del tercero queda en la auditoría.';
const STATUS_TONES = { pending: 'warning', approved: 'success', rejected: 'destructive' } as const;

interface ReviewValues {
  readonly risk: RiskLevel;
  readonly summary: string;
}

function useCreateReview(partyId: string, onSaved: () => void) {
  const api = useApiClient();
  return useAdminAction<ReviewValues, unknown>({
    run: (values, csrfToken) =>
      api.post(`/v1/parties/${partyId}/due-diligence`, {
        body: { risk_level: values.risk, summary: values.summary.trim() },
        schema: createdResponseSchema,
        csrfToken,
      }),
    invalidate: [PARTY_KEYS.all],
    onSuccess: onSaved,
    reason: REASON,
  });
}

function SummaryField(props: { readonly value: string; readonly onChange: (v: string) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="conocimiento-resumen">Qué se revisó y qué se encontró</Label>
      <Textarea
        id="conocimiento-resumen"
        aria-describedby="conocimiento-resumen-ayuda"
        rows={5}
        value={props.value}
        onChange={(event) => {
          props.onChange(event.target.value);
        }}
      />
      <p id="conocimiento-resumen-ayuda" className="text-xs text-muted-foreground">
        Por ejemplo: RUT, cámara de comercio, referencias y listas restrictivas. Mínimo 10 letras.
      </p>
    </div>
  );
}

function ReviewForm(props: { readonly partyId: string; readonly onSaved: () => void }) {
  const [values, setValues] = useState<ReviewValues>({ risk: 'low', summary: '' });
  const save = useCreateReview(props.partyId, props.onSaved);
  const submit = (event: SubmitEvent<HTMLFormElement>): void => {
    event.preventDefault();
    save.execute(values);
  };
  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      {save.error === null ? null : <FormError error={save.error} />}
      <SelectField
        id="conocimiento-riesgo"
        label="Nivel de riesgo"
        options={optionsFrom(riskLevelSchema.options, RISK_LABELS)}
        value={values.risk}
        onChange={(event) => {
          const risk = riskLevelSchema.safeParse(event.target.value);
          setValues({ ...values, risk: risk.success ? risk.data : 'low' });
        }}
      />
      <SummaryField
        value={values.summary}
        onChange={(summary) => {
          setValues({ ...values, summary });
        }}
      />
      <DialogFooter>
        <SubmitButton label="Registrar" pendingLabel="Registrando…" pending={save.pending} />
      </DialogFooter>
      {save.dialog}
    </form>
  );
}

function reviewTrail(review: DueDiligence): string {
  const requested = `Registró ${review.requested_by?.display_name ?? 'el sistema'}, ${formatDateTime(review.requested_at)}`;
  if (review.reviewed_by === null) return requested;
  const reviewer = review.reviewed_by.display_name ?? 'otra persona';
  return `${requested} · Revisó ${reviewer}, ${formatDateTime(review.reviewed_at)}`;
}

function ReviewCard(props: { readonly partyId: string; readonly review: DueDiligence }) {
  const { review } = props;
  const { session } = useSession();
  const canApprove = usePermissions().can('party.due_diligence.approve');
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RISK_TONES[review.risk_level]}>
            Riesgo {RISK_LABELS[review.risk_level].toLowerCase()}
          </Badge>
          <Badge tone={STATUS_TONES[review.status]}>{REVIEW_STATUS_LABELS[review.status]}</Badge>
          {review.next_review_on === null ? null : (
            <span>Próxima revisión: {formatDate(review.next_review_on)}</span>
          )}
        </div>
        <p className="whitespace-pre-line">{review.summary}</p>
        <p className="text-xs text-muted-foreground">{reviewTrail(review)}</p>
        {review.review_note === null ? null : (
          <p className="text-xs">Motivo: {review.review_note}</p>
        )}
        {review.status === 'pending' && canApprove ? (
          <div className="flex flex-wrap gap-2">
            <ReviewButtons
              path={`/v1/parties/${props.partyId}/due-diligence/${review.id}/actions`}
              what="el conocimiento del tercero"
              ownRequest={review.requested_by?.id === session.user.id}
              reason={REASON}
            />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function ReviewList(props: {
  readonly partyId: string;
  readonly reviews: readonly DueDiligence[];
}) {
  if (props.reviews.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck />}
        title="Todavía no hay conocimiento del tercero"
        description="Aquí aparecen las revisiones del tercero, la más reciente primero."
      />
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {props.reviews.map((review) => (
        <ReviewCard key={review.id} partyId={props.partyId} review={review} />
      ))}
    </div>
  );
}

export function DueDiligencePanel({ party }: { readonly party: PartyDetail }): JSX.Element {
  const reviews = useDueDiligence(party.id);
  const canManage = usePermissions().can('party.due_diligence.manage');
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Sin un conocimiento aprobado y vigente no se factura ni se contrata con el tercero.
      </p>
      {canManage ? (
        <div>
          <RecordDialog
            triggerLabel="Registrar el conocimiento"
            title={`Conocimiento de ${party.name}`}
            description="Queda pendiente hasta que Dirección lo apruebe. La aprobación vale 12 meses."
          >
            {(close) => <ReviewForm partyId={party.id} onSaved={close} />}
          </RecordDialog>
        </div>
      ) : null}
      <QueryState query={reviews} loadingLabel="Cargando el conocimiento del tercero">
        {({ data }) => <ReviewList partyId={party.id} reviews={data} />}
      </QueryState>
    </div>
  );
}
