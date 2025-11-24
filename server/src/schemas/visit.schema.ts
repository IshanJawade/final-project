import { z } from 'zod';

const vitalsValue = z.union([z.string(), z.number(), z.boolean(), z.null()]);
const vitalsSchema = z.record(vitalsValue);

const nonEmptyVitals = vitalsSchema.refine((value) => Object.keys(value).length > 0, 'Vitals cannot be empty');

export const VisitListQuerySchema = z.object({
  limit: z.coerce.number().min(1).max(100).default(25)
});

export const CreateVisitSchema = z.object({
  visit_datetime: z.string().datetime({ message: 'visit_datetime must be ISO 8601' }),
  vitals: nonEmptyVitals,
  notes: z.string().min(3).max(10000)
});

export const UpdateVisitSchema = z
  .object({
    visit_datetime: z.string().datetime({ message: 'visit_datetime must be ISO 8601' }).optional(),
    vitals: vitalsSchema.optional(),
    notes: z.string().min(3).max(10000).optional()
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field must be provided'
  });

export const UpsertPrescriptionSchema = z.object({
  medication_name: z.string().min(1).max(255),
  dosage: z.string().min(1).max(255),
  frequency: z.string().min(1).max(255),
  route: z.string().min(1).max(255),
  duration: z.string().min(1).max(255),
  notes: z.string().max(2000).optional()
});

export type VisitListQueryInput = z.infer<typeof VisitListQuerySchema>;
export type CreateVisitInput = z.infer<typeof CreateVisitSchema>;
export type UpdateVisitInput = z.infer<typeof UpdateVisitSchema>;
export type UpsertPrescriptionInput = z.infer<typeof UpsertPrescriptionSchema>;
