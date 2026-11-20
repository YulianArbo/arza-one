import { z } from 'zod';

import { committeeSchema, ownComplaintSchema } from './committees.js';
import { ownReportSchema } from './incidents.js';
import { checklistItemSchema, inspectionSchema } from './inspections.js';
import { medicalExamSchema } from './medical.js';
import { ppeDeliverySchema } from './ppe.js';

// Lo de SST que cada colaborador ve en «Mi espacio» (B37): sus reportes y quejas con el estado, los
// elementos de protección por confirmar, la autoinspección del puesto en casa por responder y los
// comités a los que pertenece. Su concepto de aptitud se consulta aparte: la consulta queda en la
// auditoría (decisión 7).

export const pendingHomeInspectionSchema = inspectionSchema.extend({
  checklist: z.array(checklistItemSchema),
});

export const mySstSchema = z.object({
  is_employee: z.boolean(),
  reports: z.array(ownReportSchema),
  complaints: z.array(ownComplaintSchema),
  ppe: z.array(ppeDeliverySchema),
  home_inspections: z.array(pendingHomeInspectionSchema),
  committees: z.array(committeeSchema),
});

export const myMedicalExamsSchema = z.object({ data: z.array(medicalExamSchema) });

export type PendingHomeInspection = z.infer<typeof pendingHomeInspectionSchema>;
export type MySst = z.infer<typeof mySstSchema>;
export type MyMedicalExams = z.infer<typeof myMedicalExamsSchema>;
