import { z } from 'zod';

export const CreatePatientSchema = z.object({
  first_name: z.string().min(1),
  last_name: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  phone: z.string().min(5).max(25).optional()
});

export const PatientSearchQuerySchema = z.object({
  query: z.string().min(1).optional(),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  mrn: z.string().min(3).optional(),
  code: z.string().min(2).optional(),
  limit: z.coerce.number().min(1).max(100).default(25)
});

export type CreatePatientInput = z.infer<typeof CreatePatientSchema>;
export type PatientSearchQueryInput = z.infer<typeof PatientSearchQuerySchema>;
