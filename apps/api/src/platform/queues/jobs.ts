import type { JobsOptions } from 'bullmq';
import { z } from 'zod';

// Colas y trabajos en segundo plano (ADR-014, numeral 13.2). La API (o un comando) los encola y
// el worker los procesa; ambos usan estas mismas definiciones.

/** Colas de la plataforma. Cada módulo de negocio agregará las suyas. */
export const QUEUES = { platform: 'platform' } as const;

/**
 * Todo trabajo lleva la empresa en cuyo nombre se ejecuta, que el worker fija en la transacción
 * igual que la API (numeral 13.2), y el identificador de correlación para seguirlo en los registros.
 */
const tenantJobSchema = z.object({
  tenantId: z.uuid(),
  /** null en trabajos del sistema, sin usuario. */
  userId: z.uuid().nullable(),
  correlationId: z.uuid(),
});

/** Trabajo de ejemplo (B06): envía un correo de prueba con el nombre de la empresa. */
const exampleEmailJobSchema = tenantJobSchema.extend({
  recipient: z.email(),
});

/**
 * Correo de una cuenta: invitación, recuperación de contraseña o aviso de cambio (B08) y avisos de
 * seguridad del segundo factor y de un equipo nuevo (B09) y cambios de roles (B10). Solo lleva el usuario, el propósito y
 * el momento: el worker crea el enlace al enviarlo, así la llave nunca queda guardada en la cola, y
 * lee lo demás de la base de datos.
 */
const accountEmailJobSchema = tenantJobSchema.extend({
  accountUserId: z.uuid(),
  purpose: z.enum([
    'invitation',
    'password_reset',
    'password_changed',
    'mfa_enabled',
    'mfa_changed',
    'mfa_disabled',
    'mfa_reset',
    'recovery_codes_regenerated',
    'recovery_code_used',
    'new_device',
    'permissions_changed',
  ]),
  /** Momento del hecho que se avisa; los correos con enlace no lo necesitan. */
  occurredAt: z.iso.datetime({ offset: true }).optional(),
});

/**
 * Verificación diaria de la cadena de la auditoría (B11, ficha 17.20). Es del sistema y no lleva
 * empresa: el worker abre el contexto de cada una para verificarla.
 */
const auditChainCheckJobSchema = z.object({});

/**
 * Análisis de un archivo recién subido (B14, numeral 13.2): antivirus, tipo real y huella SHA-256.
 * Solo lleva el archivo; el worker lee lo demás de la base de datos y del almacenamiento.
 */
const fileScanJobSchema = tenantJobSchema.extend({ fileId: z.uuid() });

/**
 * Conversión a PDF del archivo fuente de una versión (B18, ficha 17.4) con Gotenberg. Solo lleva
 * la versión; el worker lee lo demás de la base de datos y del almacenamiento.
 */
const versionRenderJobSchema = tenantJobSchema.extend({ versionId: z.uuid() });

/**
 * Escalamiento de las tareas vencidas (B15, ficha 17.5). Es del sistema y no lleva empresa: el
 * worker revisa cada empresa que tiene tareas vencidas.
 */
const wfOverdueCheckJobSchema = z.object({});

/**
 * Avisos (B16): publica la bandeja de salida y envía los correos cuya hora llegó. Es del sistema y
 * no lleva empresa: el worker revisa cada empresa con eventos o correos pendientes.
 */
const ntfDispatchJobSchema = z.object({});

/**
 * PDF de los formatos digitales (B20): genera el PDF de los registros diligenciados que terminaron
 * y la copia de consulta de las versiones vigentes. Es del sistema y no lleva empresa: el worker
 * revisa cada empresa con PDF pendientes.
 */
const docPdfRenderJobSchema = z.object({});

/**
 * Disposición final (B21, numeral 12.4). La propuesta del mes de cada empresa con documentos de
 * retención vencida (si aún no existe), y la ejecución de las propuestas aprobadas con su acta. Son
 * del sistema y no llevan empresa. Ninguno elimina nada sin una propuesta aprobada.
 */
const docDispositionProposeJobSchema = z.object({});
const docDispositionExecuteJobSchema = z.object({});

/**
 * Texto de las versiones vigentes para la búsqueda (B21, numeral 13.2). Es del sistema y no lleva
 * empresa: el worker revisa cada empresa con versiones sin su texto.
 */
const docTextExtractJobSchema = z.object({});

export type TenantJob = z.infer<typeof tenantJobSchema>;
export type ExampleEmailJob = z.infer<typeof exampleEmailJobSchema>;
export type AccountEmailJob = z.infer<typeof accountEmailJobSchema>;
export type AccountEmailPurpose = AccountEmailJob['purpose'];
export type FileScanJob = z.infer<typeof fileScanJobSchema>;
export type VersionRenderJob = z.infer<typeof versionRenderJobSchema>;

/** Cada trabajo: su cola, su nombre y el esquema de sus datos. */
export const JOBS = {
  exampleEmail: {
    queue: QUEUES.platform,
    name: 'platform.example-email',
    schema: exampleEmailJobSchema,
  },
  accountEmail: {
    queue: QUEUES.platform,
    name: 'iam.account-email',
    schema: accountEmailJobSchema,
  },
  auditChainCheck: {
    queue: QUEUES.platform,
    name: 'audit.chain-check',
    schema: auditChainCheckJobSchema,
  },
  fileScan: {
    queue: QUEUES.platform,
    name: 'doc.file-scan',
    schema: fileScanJobSchema,
  },
  versionRender: {
    queue: QUEUES.platform,
    name: 'doc.version-render',
    schema: versionRenderJobSchema,
  },
  wfOverdueCheck: {
    queue: QUEUES.platform,
    name: 'wf.overdue-check',
    schema: wfOverdueCheckJobSchema,
  },
  ntfDispatch: {
    queue: QUEUES.platform,
    name: 'ntf.dispatch',
    schema: ntfDispatchJobSchema,
  },
  docPdfRender: {
    queue: QUEUES.platform,
    name: 'doc.pdf-render',
    schema: docPdfRenderJobSchema,
  },
  docDispositionPropose: {
    queue: QUEUES.platform,
    name: 'doc.disposition-propose',
    schema: docDispositionProposeJobSchema,
  },
  docDispositionExecute: {
    queue: QUEUES.platform,
    name: 'doc.disposition-execute',
    schema: docDispositionExecuteJobSchema,
  },
  docTextExtract: {
    queue: QUEUES.platform,
    name: 'doc.text-extract',
    schema: docTextExtractJobSchema,
  },
} as const;

/** Trabajos programados: el worker los registra al arrancar (expresión cron, hora de Bogotá). */
export const SCHEDULED_JOBS = [
  { id: 'audit.chain-check.daily', job: JOBS.auditChainCheck, pattern: '0 3 * * *' },
  // Cada 15 minutos: una tarea vencida escala al jefe inmediato a lo sumo un cuarto de hora después.
  { id: 'wf.overdue-check.quarter-hour', job: JOBS.wfOverdueCheck, pattern: '*/15 * * * *' },
  // Cada 15 segundos (el primer campo son los segundos): un aviso llega casi de inmediato.
  { id: 'ntf.dispatch.every-15-seconds', job: JOBS.ntfDispatch, pattern: '*/15 * * * * *' },
  // Cada 20 segundos: el PDF de un registro terminado queda listo casi de inmediato.
  { id: 'doc.pdf-render.every-20-seconds', job: JOBS.docPdfRender, pattern: '*/20 * * * * *' },
  // Cada día a las 6:10: si aún no existe la propuesta del mes y hay vencidos, la crea (una al mes).
  { id: 'doc.disposition-propose.daily', job: JOBS.docDispositionPropose, pattern: '10 6 * * *' },
  // Cada minuto: una propuesta aprobada se ejecuta y deja su acta en poco tiempo.
  {
    id: 'doc.disposition-execute.every-minute',
    job: JOBS.docDispositionExecute,
    pattern: '* * * * *',
  },
  // Cada minuto: una versión recién publicada se puede buscar por su texto poco después.
  { id: 'doc.text-extract.every-minute', job: JOBS.docTextExtract, pattern: '* * * * *' },
] as const;

export type JobDefinition = (typeof JOBS)[keyof typeof JOBS];

const SECOND = 1000;
const DAY = 24 * 60 * 60 * SECOND;

/**
 * Reintentos de todo trabajo: seis intentos con espera creciente (5, 10, 20, 40 y 80 segundos;
 * unos dos minutos y medio en total). Los terminados se guardan 7 días y los fallidos 30, para
 * revisarlos (numeral 10.7: alerta con trabajos fallidos sin reintento).
 */
export const DEFAULT_JOB_OPTIONS: JobsOptions = {
  attempts: 6,
  backoff: { type: 'exponential', delay: 5 * SECOND },
  removeOnComplete: { age: (7 * DAY) / SECOND, count: 1000 },
  removeOnFail: { age: (30 * DAY) / SECOND },
};
