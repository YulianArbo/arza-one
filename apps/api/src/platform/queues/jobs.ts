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

/**
 * Recordatorios de las actividades comerciales (B22): es del sistema y no lleva empresa; el worker
 * revisa cada empresa con actividades por empezar.
 */
const crmActivityRemindJobSchema = z.object({});

/**
 * Cotizaciones (B23): el PDF FT-COM-001 de las aprobadas y el correo con el enlace de las enviadas,
 * y cada día el vencimiento de las enviadas cuya vigencia pasó. Son del sistema y no llevan empresa.
 */
const crmQuoteWorkJobSchema = z.object({});
const crmQuoteExpireJobSchema = z.object({});

/**
 * Contratos (B24): el PDF definitivo de los contratos y otrosíes aprobados, y cada día las alertas
 * de vencimiento y las obligaciones. Son del sistema y no llevan empresa.
 */
const ctrPdfRenderJobSchema = z.object({});
const ctrFollowUpJobSchema = z.object({});

/**
 * Firma electrónica (B25): cada pocos segundos, los correos con enlace, los códigos pedidos y el
 * documento firmado de los procesos que terminaron; cada día, los recordatorios y los vencimientos.
 * Son del sistema y no llevan empresa. El código nunca va en la cola: el worker lo genera.
 */
const sigWorkJobSchema = z.object({});
const sigFollowUpJobSchema = z.object({});

/**
 * Actas de entrega de los proyectos (B27): cada pocos segundos, la que ya tiene su PDF sale a firma
 * del cliente y la que el cliente respondió deja aceptado o devuelto su entregable. Del sistema.
 */
const prjAcceptanceWorkJobSchema = z.object({});
/**
 * Comodatos de los activos (B34): cada pocos segundos, el que ya tiene su PDF sale a firma del
 * colaborador y el que se firmó o se cerró deja vigente o anulada su asignación. Del sistema.
 */
const astLoanWorkJobSchema = z.object({});
const hrRetentionJobSchema = z.object({});
const hrDailyWorkJobSchema = z.object({});
const sstDailyWorkJobSchema = z.object({});
const qmsDailyWorkJobSchema = z.object({});
/** Alertas de renovación de marcas y dominios de Innovación (B40, decisión 6). Del sistema. */
const innDailyWorkJobSchema = z.object({});
/** Índice del asistente de IA (B47, decisión 3): fragmentos del texto vigente. Del sistema. */
const aiIndexWorkJobSchema = z.object({});
/** Indicadores de Calidad (B39): cálculo de los automáticos y aviso de los manuales sin medir. */
const qmsIndicatorWorkJobSchema = z.object({});
/** PDF del informe de auditoría y del acta de revisión por la dirección (B39). Del sistema. */
const qmsPdfWorkJobSchema = z.object({});
const svcSlaWorkJobSchema = z.object({});
/**
 * Correos y plazos de las PQRSF y las encuestas (B29): acuse, respuesta, invitación a la encuesta y
 * avisos de «por vencer» y vencida. Es del sistema: recorre las empresas con trabajo.
 */
const svcCareWorkJobSchema = z.object({});
/** Acuse de los formularios del sitio con su enlace de baja (B41). Recorre las empresas con trabajo. */
const webSiteWorkJobSchema = z.object({});
/** Correos al titular y PDF de la entrega de sus datos (B42). Del sistema. */
const prvRequestWorkJobSchema = z.object({});
/** Avisos de plazo, desistimiento y retención de Privacidad (B42). Del sistema. */
const prvDailyWorkJobSchema = z.object({});

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
  crmActivityRemind: {
    queue: QUEUES.platform,
    name: 'crm.activity-remind',
    schema: crmActivityRemindJobSchema,
  },
  crmQuoteWork: {
    queue: QUEUES.platform,
    name: 'crm.quote-work',
    schema: crmQuoteWorkJobSchema,
  },
  crmQuoteExpire: {
    queue: QUEUES.platform,
    name: 'crm.quote-expire',
    schema: crmQuoteExpireJobSchema,
  },
  ctrPdfRender: {
    queue: QUEUES.platform,
    name: 'ctr.pdf-render',
    schema: ctrPdfRenderJobSchema,
  },
  ctrFollowUp: {
    queue: QUEUES.platform,
    name: 'ctr.follow-up',
    schema: ctrFollowUpJobSchema,
  },
  sigWork: {
    queue: QUEUES.platform,
    name: 'sig.work',
    schema: sigWorkJobSchema,
  },
  sigFollowUp: {
    queue: QUEUES.platform,
    name: 'sig.follow-up',
    schema: sigFollowUpJobSchema,
  },
  prjAcceptanceWork: {
    queue: QUEUES.platform,
    name: 'prj.acceptance-work',
    schema: prjAcceptanceWorkJobSchema,
  },
  astLoanWork: {
    queue: QUEUES.platform,
    name: 'ast.loan-work',
    schema: astLoanWorkJobSchema,
  },
  hrRetention: {
    queue: QUEUES.platform,
    name: 'hr.retention',
    schema: hrRetentionJobSchema,
  },
  hrDailyWork: {
    queue: QUEUES.platform,
    name: 'hr.daily-work',
    schema: hrDailyWorkJobSchema,
  },
  sstDailyWork: {
    queue: QUEUES.platform,
    name: 'sst.daily-work',
    schema: sstDailyWorkJobSchema,
  },
  qmsDailyWork: {
    queue: QUEUES.platform,
    name: 'qms.daily-work',
    schema: qmsDailyWorkJobSchema,
  },
  innDailyWork: {
    queue: QUEUES.platform,
    name: 'inn.daily-work',
    schema: innDailyWorkJobSchema,
  },
  aiIndexWork: {
    queue: QUEUES.platform,
    name: 'ai.index-work',
    schema: aiIndexWorkJobSchema,
  },
  qmsIndicatorWork: {
    queue: QUEUES.platform,
    name: 'qms.indicator-work',
    schema: qmsIndicatorWorkJobSchema,
  },
  qmsPdfWork: {
    queue: QUEUES.platform,
    name: 'qms.pdf-work',
    schema: qmsPdfWorkJobSchema,
  },
  svcSlaWork: {
    queue: QUEUES.platform,
    name: 'svc.sla-work',
    schema: svcSlaWorkJobSchema,
  },
  svcCareWork: {
    queue: QUEUES.platform,
    name: 'svc.care-work',
    schema: svcCareWorkJobSchema,
  },
  webSiteWork: {
    queue: QUEUES.platform,
    name: 'web.site-work',
    schema: webSiteWorkJobSchema,
  },
  prvRequestWork: {
    queue: QUEUES.platform,
    name: 'prv.request-work',
    schema: prvRequestWorkJobSchema,
  },
  prvDailyWork: {
    queue: QUEUES.platform,
    name: 'prv.daily-work',
    schema: prvDailyWorkJobSchema,
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
  // Cada minuto: el recordatorio de una actividad llega 30 minutos antes de su hora, a lo sumo uno
  // después.
  { id: 'crm.activity-remind.every-minute', job: JOBS.crmActivityRemind, pattern: '* * * * *' },
  // Cada 20 segundos: el PDF de una cotización aprobada y el correo de una enviada salen enseguida.
  { id: 'crm.quote-work.every-20-seconds', job: JOBS.crmQuoteWork, pattern: '*/20 * * * * *' },
  // Cada día a las 0:05: vencen las enviadas cuyo último día de vigencia fue ayer.
  { id: 'crm.quote-expire.daily', job: JOBS.crmQuoteExpire, pattern: '5 0 * * *' },
  // Cada 20 segundos: el PDF definitivo de un contrato o un otrosí aprobado queda listo enseguida.
  { id: 'ctr.pdf-render.every-20-seconds', job: JOBS.ctrPdfRender, pattern: '*/20 * * * * *' },
  // Cada día a las 6:15: alertas de vencimiento, fin de plazo y obligaciones, antes de la jornada.
  { id: 'ctr.follow-up.daily', job: JOBS.ctrFollowUp, pattern: '15 6 * * *' },
  // Cada 10 segundos: el código de seis números llega al correo casi de inmediato (vale diez minutos).
  { id: 'sig.work.every-10-seconds', job: JOBS.sigWork, pattern: '*/10 * * * * *' },
  // Cada día a las 7:00: recordatorios y vencimiento de los procesos de firma, antes de la jornada.
  { id: 'sig.follow-up.daily', job: JOBS.sigFollowUp, pattern: '0 7 * * *' },
  // Cada 20 segundos: el acta de una entrega sale a firma apenas su PDF está listo, y la respuesta
  // del cliente llega al proyecto poco después de que firma o devuelve.
  {
    id: 'prj.acceptance-work.every-20-seconds',
    job: JOBS.prjAcceptanceWork,
    pattern: '*/20 * * * * *',
  },
  // Cada 20 segundos: el comodato de un activo sale a firma apenas su PDF está listo, y la
  // asignación queda vigente poco después de que el colaborador firma (B34).
  { id: 'ast.loan-work.every-20-seconds', job: JOBS.astLoanWork, pattern: '*/20 * * * * *' },
  { id: 'hr.retention.daily', job: JOBS.hrRetention, pattern: '0 4 * * *' },
  // Cada día a las 0:05: las ausencias que terminaron quedan disfrutadas y la cuenta de quien se
  // retiró se desactiva apenas termina su último día laborado (B36, numeral 15.1).
  { id: 'hr.daily-work.daily', job: JOBS.hrDailyWork, pattern: '5 0 * * *' },
  // Cada día a las 6:00: SST recibe el recordatorio de cada accidente sin reportar a la ARL, las
  // evaluaciones médicas que vencen en 30 días y las actividades vencidas del plan (B37).
  { id: 'sst.daily-work.daily', job: JOBS.sstDailyWork, pattern: '0 6 * * *' },
  // Cada día a las 6:15: las acciones de calidad vencidas sin ejecutar escalan a su responsable, a
  // Calidad y a la Dirección; el aviso se repite cada 7 días (B38, decisión 11).
  { id: 'qms.daily-work.daily', job: JOBS.qmsDailyWork, pattern: '15 6 * * *' },
  // Cada día a las 6:30: los indicadores automáticos del periodo que cerró se calculan y, desde el
  // día 5, el responsable de un indicador manual sin medir recibe el aviso (B39, decisión 7).
  { id: 'qms.indicator-work.daily', job: JOBS.qmsIndicatorWork, pattern: '30 6 * * *' },
  // Cada 30 segundos: el informe de una auditoría emitida y el acta aprobada quedan en PDF (B39).
  { id: 'qms.pdf-work.every-30-seconds', job: JOBS.qmsPdfWork, pattern: '*/30 * * * * *' },
  // Cada día a las 6:45: el responsable de una marca a seis meses de vencer o de un dominio a 60
  // días recibe la tarea de renovarlo, y lo vencido queda vencido (B40, decisión 6).
  { id: 'inn.daily-work.daily', job: JOBS.innDailyWork, pattern: '45 6 * * *' },
  // Cada 5 minutos: un documento publicado entra al índice del asistente, y uno que dejó de estar
  // vigente o pasó a restringido sale de él, a lo sumo cinco minutos después de su texto (B47).
  { id: 'ai.index-work.every-5-minutes', job: JOBS.aiIndexWork, pattern: '*/5 * * * *' },
  // Cada 5 minutos: la alerta del 80 % y la del plazo vencido llegan a lo sumo cinco minutos tarde,
  // y los tiquetes resueltos que nadie reabrió se cierran (B28).
  { id: 'svc.sla-work.every-5-minutes', job: JOBS.svcSlaWork, pattern: '*/5 * * * *' },
  // Cada 30 segundos: el acuse de una PQRSF y la encuesta de un tiquete resuelto llegan casi de
  // inmediato; los avisos de plazo, a lo sumo medio minuto tarde (B29).
  { id: 'svc.care-work.every-30-seconds', job: JOBS.svcCareWork, pattern: '*/30 * * * * *' },
  // Cada 30 segundos: el acuse de un formulario del sitio llega casi de inmediato (B41).
  { id: 'web.site-work.every-30-seconds', job: JOBS.webSiteWork, pattern: '*/30 * * * * *' },
  // Cada 30 segundos: la constancia, el requerimiento, la prórroga y la respuesta llegan al titular
  // casi de inmediato, y el PDF de la entrega de sus datos queda listo (B42).
  { id: 'prv.request-work.every-30-seconds', job: JOBS.prvRequestWork, pattern: '*/30 * * * * *' },
  // Cada día a las 7:00: avisos de plazo al Oficial, cierre por desistimiento y retención de las
  // cookies y de los formularios del sitio (B42, decisiones 4, 10 y 11).
  { id: 'prv.daily-work.daily', job: JOBS.prvDailyWork, pattern: '0 7 * * *' },
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
