import { z } from 'zod';

import {
  sstDateSchema,
  sstEnumOf,
  sstIdSchema,
  sstOptionalText,
  sstRefSchema,
  sstTextSchema,
} from './common.js';

// Comités: COPASST (o Vigía de SST) y Comité de Convivencia Laboral (B37, decisiones 8 y 9;
// RE-SST-004, RE-SST-007; Ley 1010 de 2006 y Ley 2365 de 2024). SST registra quiénes los integran.
// Lo del Comité de Convivencia (actas y quejas) solo lo ven sus integrantes vigentes: ni SST, ni la
// Dirección, ni el administrador. Los textos de convivencia van cifrados y cada consulta queda en la
// auditoría.

export const COMMITTEES = {
  copasst: 'COPASST o Vigía de SST',
  coexistence: 'Comité de Convivencia Laboral',
} as const;
export type Committee = keyof typeof COMMITTEES;
export const committeeSchema = sstEnumOf(COMMITTEES);

export const COMMITTEE_ROLES = {
  president: 'Presidente',
  secretary: 'Secretario',
  member: 'Integrante',
} as const;
export const committeeRoleSchema = sstEnumOf(COMMITTEE_ROLES);

export const REPRESENTS = { employer: 'Empleador', workers: 'Trabajadores' } as const;
export const representsSchema = sstEnumOf(REPRESENTS);

export const committeeMemberSchema = z.object({
  id: sstIdSchema,
  committee: committeeSchema,
  person: sstRefSchema,
  role: committeeRoleSchema,
  represents: representsSchema,
  from_on: sstDateSchema,
  until_on: sstDateSchema.nullable(),
  active: z.boolean(),
  version: z.number().int().positive(),
});
export const committeeMemberListResponseSchema = z.object({
  data: z.array(committeeMemberSchema),
});

export const addCommitteeMemberSchema = z
  .strictObject({
    committee: committeeSchema,
    user_id: sstIdSchema,
    role: committeeRoleSchema.default('member'),
    represents: representsSchema,
    from_on: sstDateSchema,
    until_on: sstDateSchema.nullable().default(null),
  })
  .refine((input) => input.until_on === null || input.until_on > input.from_on, {
    path: ['until_on'],
    message: 'El periodo termina después de empezar.',
  });

export const endCommitteeMemberSchema = z.strictObject({ until_on: sstDateSchema });

export const committeeMinuteSchema = z.object({
  id: sstIdSchema,
  committee: committeeSchema,
  meeting_on: sstDateSchema,
  summary: z.string(),
  file_id: sstIdSchema.nullable(),
  recorded_by: sstRefSchema,
  version: z.number().int().positive(),
});
export const committeeMinuteListResponseSchema = z.object({
  data: z.array(committeeMinuteSchema),
});

export const committeeQuerySchema = z.strictObject({ committee: committeeSchema });

export const recordCommitteeMinuteSchema = z.strictObject({
  committee: committeeSchema,
  meeting_on: sstDateSchema,
  summary: sstTextSchema(10, 8000).describe('Temas tratados y compromisos'),
  file_id: sstIdSchema.nullable().default(null).describe('Acta firmada en PDF'),
});

/** Lo que la persona sabe de sus comités: a cuáles pertenece hoy. */
export const myCommitteesSchema = z.object({ data: z.array(committeeSchema) });

export const COMPLAINT_STATUS = {
  received: 'Recibida',
  in_review: 'En trámite',
  closed: 'Cerrada',
} as const;
export const complaintStatusSchema = sstEnumOf(COMPLAINT_STATUS);

/** Queja de convivencia completa: solo para los integrantes vigentes del comité. */
export const complaintSchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  complainant: sstRefSchema,
  received_at: z.iso.datetime({ offset: true }),
  status: complaintStatusSchema,
  facts: z.string(),
  outcome: z.string().nullable(),
  version: z.number().int().positive(),
});
export const complaintListResponseSchema = z.object({ data: z.array(complaintSchema) });

/** Lo que quien se queja ve de su queja: el estado. */
export const ownComplaintSchema = z.object({
  id: sstIdSchema,
  code: z.string(),
  received_at: z.iso.datetime({ offset: true }),
  status: complaintStatusSchema,
});

export const fileComplaintSchema = z.strictObject({
  facts: sstTextSchema(20, 8000).describe('Qué pasó, cuándo y quiénes estuvieron'),
});

export const handleComplaintSchema = z.strictObject({
  status: z.enum(['in_review', 'closed']),
  outcome: sstOptionalText(4000).describe('Gestión del comité; obligatoria al cerrar'),
});

export type CommitteeMember = z.infer<typeof committeeMemberSchema>;
export type AddCommitteeMember = z.infer<typeof addCommitteeMemberSchema>;
export type EndCommitteeMember = z.infer<typeof endCommitteeMemberSchema>;
export type CommitteeMinute = z.infer<typeof committeeMinuteSchema>;
export type RecordCommitteeMinute = z.infer<typeof recordCommitteeMinuteSchema>;
export type Complaint = z.infer<typeof complaintSchema>;
export type OwnComplaint = z.infer<typeof ownComplaintSchema>;
export type FileComplaint = z.infer<typeof fileComplaintSchema>;
export type HandleComplaint = z.infer<typeof handleComplaintSchema>;
