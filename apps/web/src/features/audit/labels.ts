import type { AuditEvent, ChainProblem, SecuritySeverity } from '@arza/contracts';

// Textos de la auditoría (B11, numeral 16.6: sin jerga, trato de usted).

/** Rutas de la auditoría (numeral 16.7). */
export const AUDIT_PATHS = {
  events: '/app/auditoria',
  security: '/app/auditoria/seguridad',
  exports: '/app/auditoria/exportaciones',
  integrity: '/app/auditoria/integridad',
} as const;

/** Qué hizo cada acción, dicho para la persona. La acción sin traducir se muestra tal cual. */
const ACTION_LABELS: Readonly<Record<string, string>> = {
  'core.tenant.create': 'Creó la empresa',
  'core.tenant.update': 'Cambió los datos de la empresa',
  'core.site.create': 'Creó una sede',
  'core.site.update': 'Editó una sede',
  'core.site.delete': 'Eliminó una sede',
  'core.org_unit.create': 'Creó un proceso o área',
  'core.org_unit.update': 'Editó un proceso o área',
  'core.org_unit.delete': 'Eliminó un proceso o área',
  'core.org_unit.seed': 'Cargó los procesos iniciales',
  'core.position.create': 'Creó un cargo',
  'core.position.update': 'Editó un cargo',
  'core.position.delete': 'Eliminó un cargo',
  'core.position.seed': 'Cargó el organigrama inicial',
  'core.cost_center.create': 'Creó un centro de costo',
  'core.cost_center.update': 'Editó un centro de costo',
  'core.cost_center.delete': 'Eliminó un centro de costo',
  'core.catalog.seed': 'Cargó un catálogo',
  'core.catalog_item.create': 'Agregó una opción a un catálogo',
  'core.catalog_item.update': 'Editó una opción de un catálogo',
  'core.parameter.update': 'Cambió un parámetro',
  'core.parameter.seed': 'Cargó el horario laboral inicial',
  'core.sequence.create': 'Creó un consecutivo',
  'core.sequence.update': 'Editó un consecutivo',
  'core.holiday.create': 'Agregó un festivo',
  'core.holiday.delete': 'Quitó un festivo',
  'core.holiday.seed': 'Cargó los festivos de un año',
  'iam.session.create': 'Inició sesión',
  'iam.session.revoke': 'Cerró una sesión',
  'iam.session.revoke_others': 'Cerró sus otras sesiones',
  'iam.session.reauthenticate': 'Confirmó su identidad',
  'iam.session.revoke_user': 'Cerró las sesiones de una persona',
  'iam.session.revoke_all': 'Cerró todas las sesiones de la empresa',
  'iam.mfa.verify': 'Usó el segundo factor',
  'iam.mfa.setup_start': 'Empezó a configurar el segundo factor',
  'iam.mfa.setup_confirm': 'Confirmó la configuración del segundo factor',
  'iam.mfa.enable': 'Activó el segundo factor',
  'iam.mfa.change': 'Pasó el segundo factor a otro celular',
  'iam.mfa.disable': 'Desactivó el segundo factor',
  'iam.mfa.recovery_codes_regenerate': 'Generó códigos de recuperación nuevos',
  'iam.password.change': 'Cambió su contraseña',
  'iam.password.reset_request': 'Pidió recuperar la contraseña',
  'iam.password.reset': 'Restableció la contraseña',
  'iam.link.issue': 'Se envió un enlace por correo',
  'iam.user.invite': 'Invitó a una persona',
  'iam.invitation.accept': 'Activó su cuenta',
  'iam.user.lock': 'Bloqueó una cuenta',
  'iam.user.unlock': 'Desbloqueó una cuenta',
  'iam.user.position': 'Cambió el cargo de una persona',
  'iam.user.reset_mfa': 'Reinició el segundo factor de una cuenta',
  'iam.role.create': 'Creó un rol',
  'iam.role.update': 'Editó un rol',
  'iam.role.sync': 'Actualizó los roles del sistema',
  'iam.permission.sync': 'Actualizó el catálogo de permisos',
  'iam.role.assign': 'Asignó un rol',
  'iam.role.revoke': 'Retiró un rol',
  'iam.delegation.create': 'Creó una delegación',
  'iam.delegation.revoke': 'Retiró una delegación',
  'iam.access_review.read': 'Consultó la revisión de accesos',
  'party.create': 'Registró un tercero',
  'party.update': 'Editó los datos de un tercero',
  'party.status.change': 'Cambió el estado de un tercero',
  'party.role.add': 'Agregó un papel a un tercero',
  'party.role.end': 'Terminó un papel de un tercero',
  'party.merge': 'Fusionó un tercero duplicado',
  'party.contact.create': 'Agregó un contacto',
  'party.contact.update': 'Editó un contacto',
  'party.contact.delete': 'Retiró un contacto',
  'party.bank_account.create': 'Registró una cuenta bancaria',
  'party.bank_account.approve': 'Aprobó una cuenta bancaria',
  'party.bank_account.reject': 'Rechazó una cuenta bancaria',
  'party.bank_account.reveal': 'Consultó el número completo de una cuenta',
  'party.due_diligence.create': 'Registró el conocimiento de un tercero',
  'party.due_diligence.approve': 'Aprobó el conocimiento de un tercero',
  'party.due_diligence.reject': 'Rechazó el conocimiento de un tercero',
  'party.demo.seed': 'Cargó terceros de demostración',
  'doc.file.create': 'Pidió subir un archivo',
  'doc.file.upload': 'Subió un archivo',
  'doc.file.scan': 'Analizó un archivo con el antivirus',
  'doc.file.download_link': 'Pidió el enlace de descarga de un archivo',
  'doc.file.download': 'Descargó un archivo',
  'doc.folder.create': 'Creó una carpeta o un expediente',
  'doc.folder.update': 'Renombró una carpeta',
  'doc.document.create': 'Creó un documento',
  'doc.document.view': 'Consultó un documento restringido',
  'doc.version.create': 'Creó una versión de un documento',
  'doc.version.update': 'Corrigió el borrador de una versión',
  'doc.version.render': 'Convirtió una versión a PDF',
  'doc.version.submit': 'Envió una versión a revisión',
  'doc.version.reject': 'Devolvió una versión al borrador',
  'doc.version.approve': 'Aprobó una versión',
  'doc.version.publish': 'Publicó una versión',
  'doc.version.obsolete': 'Declaró obsoleta una versión',
  'doc.version.download_link': 'Pidió el enlace de descarga de una versión',
  'doc.link.create': 'Vinculó un documento',
  'doc.link.delete': 'Retiró el vínculo de un documento',
  'wf.definition.create': 'Creó un flujo',
  'wf.definition.update': 'Editó el borrador de un flujo',
  'wf.definition.publish': 'Publicó una versión de un flujo',
  'wf.definition.new_version': 'Creó una versión nueva de un flujo',
  'wf.demo.seed': 'Cargó el flujo de demostración',
  'wf.instance.start': 'Inició un trámite',
  'wf.instance.transition': 'Movió un trámite de paso',
  'wf.task.start': 'Tomó una tarea',
  'wf.task.complete': 'Completó una tarea',
  'wf.task.approve': 'Aprobó una tarea',
  'wf.task.reject': 'Rechazó una tarea',
  'wf.task.delegate': 'Delegó una tarea',
  'wf.task.reassign': 'Reasignó una tarea',
  'wf.task.escalate': 'Escaló una tarea vencida al jefe inmediato',
  'ntf.template.seed': 'Cargó las plantillas de aviso',
  'ntf.template.update': 'Cambió una plantilla de aviso',
  'ntf.notification.read': 'Leyó un aviso',
  'ntf.notification.read_all': 'Marcó todos sus avisos como leídos',
  'ntf.preference.update': 'Cambió sus preferencias de aviso',
  'ntf.comment.create': 'Comentó un registro',
  'ntf.comment.delete': 'Retiró un comentario',
  'ntf.attachment.create': 'Adjuntó un archivo a un registro',
  'ntf.attachment.delete': 'Retiró un adjunto',
  'audit.event.read': 'Consultó la auditoría',
  'audit.security.read': 'Consultó los eventos de seguridad',
  'audit.event.export': 'Exportó la auditoría',
  'audit.chain.verify': 'Verificó la integridad de la auditoría',
};

export function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

/** Quién actuó: la persona, «El sistema» o «Sin sesión». */
export function actorLabel(actor: AuditEvent['actor']): string {
  if (actor.kind === 'system') return 'El sistema';
  if (actor.kind === 'anonymous') return 'Sin sesión';
  return actor.display_name ?? actor.email ?? 'Persona sin datos';
}

export const RESULT_LABELS = { success: 'Éxito', failure: 'Fallo' } as const;

export const SEVERITY_LABELS: Readonly<Record<SecuritySeverity, string>> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const SEVERITY_TONES: Readonly<
  Record<SecuritySeverity, 'neutral' | 'warning' | 'destructive'>
> = {
  low: 'neutral',
  medium: 'warning',
  high: 'destructive',
  critical: 'destructive',
};

export const CHAIN_PROBLEM_LABELS: Readonly<Record<ChainProblem, string>> = {
  missing: 'Falta un evento o hay uno de más.',
  altered: 'Un evento fue modificado después de registrarse.',
  broken_link: 'Un evento ya no está unido al anterior.',
  truncated: 'Se borraron los eventos más recientes.',
};

/** Lo que cambió, en una línea: «name: Apoyo → Apoyo comercial · bankAccount: cambió». */
export function changesSummary(changes: Record<string, unknown>): string {
  const parts = Object.entries(changes).map(([field, value]) => `${field}: ${valueText(value)}`);
  return parts.length === 0 ? '—' : parts.join(' · ');
}

function valueText(value: unknown): string {
  if (isRecord(value) && 'from' in value && 'to' in value) {
    return `${plain(value['from'])} → ${plain(value['to'])}`;
  }
  if (isRecord(value) && value['changed'] === true) return 'cambió';
  return plain(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function plain(value: unknown): string {
  if (value === null || value === undefined) return 'vacío';
  if (isRecord(value) && Object.keys(value).length === 0) return 'ninguno';
  return typeof value === 'string' ? value : JSON.stringify(value);
}

/** Tipo de registro, dicho para la persona. */
const ENTITY_LABELS: Readonly<Record<string, string>> = {
  tenant: 'Empresa',
  iam_user: 'Usuario',
  iam_role: 'Rol',
  iam_session: 'Sesión',
  iam_delegation: 'Delegación',
  iam_mfa_factor: 'Segundo factor',
  iam_token: 'Enlace de correo',
  iam_access_review: 'Revisión de accesos',
  iam_permission: 'Catálogo de permisos',
  party: 'Tercero',
  party_contact: 'Contacto',
  party_bank_account: 'Cuenta bancaria',
  party_due_diligence: 'Conocimiento del tercero',
  aud_events: 'Auditoría',
  aud_exports: 'Exportación',
  aud_security_events: 'Eventos de seguridad',
  ntf_template: 'Plantilla de aviso',
  ntf_notification: 'Aviso',
  ntf_preference: 'Preferencias de aviso',
  core_comment: 'Comentario',
  core_attachment: 'Adjunto',
  doc_file: 'Archivo',
  doc_folder: 'Carpeta',
  doc_document: 'Documento',
  doc_version: 'Versión de documento',
  doc_link: 'Vínculo de documento',
};

export function entityLabel(entityType: string): string {
  return ENTITY_LABELS[entityType] ?? entityType;
}
