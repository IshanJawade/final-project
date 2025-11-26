import { z } from 'zod';

export const DoctorListQuerySchema = z.object({
  specialization: z.string().min(1).optional(),
  include_inactive: z.coerce.boolean().optional(),
  limit: z.coerce.number().min(1).max(100).default(50)
});

export type DoctorListQueryInput = z.infer<typeof DoctorListQuerySchema>;
