'use client';

import type { PermissionCode, RecordRef } from '@arza/contracts';
import type { JSX } from 'react';

import { usePermissions } from '../session/permissions';
import { AttachmentsPanel } from './attachments-panel';
import { CommentsPanel } from './comments-panel';

/**
 * Comentarios y adjuntos de cualquier registro (B16, numeral 16.3). Cada módulo lo pone en su ficha
 * con los permisos que le dejan escribir; la API vuelve a revisarlos.
 */
export function RecordActivity(props: {
  readonly record: RecordRef;
  readonly writePermissions: readonly PermissionCode[];
}): JSX.Element {
  const permissions = usePermissions();
  const canWrite = props.writePermissions.some((code) => permissions.can(code));
  return (
    <div className="flex flex-col gap-8">
      <CommentsPanel record={props.record} canWrite={canWrite} />
      <AttachmentsPanel record={props.record} canWrite={canWrite} />
    </div>
  );
}
