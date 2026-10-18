'use client';

import type { ChangeRequest, ChangeRequestAction } from '@arza/contracts';
import Link from 'next/link';
import type { JSX } from 'react';

import { SelectField } from '../administration/select-field';
import { idOrNull, optionsOf } from '../organization/record-dialog';
import { NEW_REQUEST_PATH, newRequestFor } from './labels';
import { useChangeRequests } from './sgc-queries';

// Elegir la Solicitud de Acción Documental aprobada que autoriza el cambio (B19, ficha 17.4): un
// documento del SGC nuevo, una versión nueva o declarar obsoleto un documento. Solo se ofrecen las
// aprobadas y sin usar que piden exactamente esa acción.

interface RequestSelectProps {
  readonly id: string;
  readonly action: ChangeRequestAction;
  /** Documento que se modifica o se declara obsoleto; null en una creación. */
  readonly documentId: string | null;
  /** En una creación, solo las solicitudes que pidieron este tipo y proceso. */
  readonly matches?: (request: ChangeRequest) => boolean;
  readonly value: string | null;
  readonly error: string | undefined;
  readonly onChange: (value: string | null) => void;
}

function requestLabel(request: ChangeRequest): string {
  return `${request.code} · ${request.title}`;
}

export function RequestSelect(props: RequestSelectProps): JSX.Element {
  const filters =
    props.documentId === null
      ? { usable: props.action }
      : { usable: props.action, documentId: props.documentId };
  const requests = (useChangeRequests(filters).data?.data ?? []).filter(
    (request) => props.matches?.(request) ?? true,
  );
  const newRequest =
    props.documentId === null || props.action === 'create'
      ? NEW_REQUEST_PATH
      : newRequestFor(props.documentId, props.action);
  return (
    <div className="flex flex-col gap-1">
      <SelectField
        id={props.id}
        label="Solicitud de Acción Documental aprobada"
        hint="Un cambio en un documento del SGC se hace con una solicitud aprobada (FT-SGC-001)."
        value={props.value ?? ''}
        error={props.error}
        options={optionsOf(
          requests.map((request) => ({ id: request.id, label: requestLabel(request) })),
          requests.length === 0 ? 'No hay solicitudes aprobadas para esto' : 'Elija la solicitud',
        )}
        onChange={(event) => {
          props.onChange(idOrNull(event.target.value));
        }}
      />
      <Link href={newRequest} className="text-xs text-primary hover:underline">
        Radicar una solicitud nueva
      </Link>
    </div>
  );
}
