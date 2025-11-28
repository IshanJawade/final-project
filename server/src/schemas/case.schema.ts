import { z } from 'zod';

const uuid = () => z.string().uuid();

export const CaseListQuerySchema = z.object({
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  patient_id: uuid().optional(),
  patient_code: z.string().min(2).optional(),
  doctor_id: uuid().optional(),
  case_code: z.string().min(2).optional(),
  limit: z.coerce.number().min(1).max(100).default(25)
});

export const CreateCaseSchema = z.object({
  patient_id: uuid(),
  assigned_doctor_id: uuid(),
  summary: z.string().min(3).max(2000).optional(),
  symptoms_text: z.string().min(3).max(10000).optional()
});

export const UpdateCaseSchema = z
  .object({
    summary: z.string().min(3).max(2000).optional(),
    symptoms_text: z.string().min(3).max(10000).optional(),
    assigned_doctor_id: uuid().optional()
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field must be provided'
  });

export const CloseCaseSchema = z.object({
  summary: z.string().min(3).max(2000).optional()
});

export type CaseListQueryInput = z.infer<typeof CaseListQuerySchema>;
export type CreateCaseInput = z.infer<typeof CreateCaseSchema>;
export type UpdateCaseInput = z.infer<typeof UpdateCaseSchema>;
export type CloseCaseInput = z.infer<typeof CloseCaseSchema>;
