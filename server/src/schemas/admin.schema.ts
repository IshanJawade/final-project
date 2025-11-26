import { z } from 'zod';

export const CreateStaffSchema = z
  .object({
    role: z.enum(['DOCTOR', 'RECEPTIONIST']),
    email: z.string().email(),
    password: z.string().min(8),
    first_name: z.string().min(1),
    last_name: z.string().min(1),
    phone: z.string().min(5).max(25).optional(),
    dob: z.string().regex(/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/),
    specialization_id: z.string().uuid().optional(),
    license_number: z.string().min(3).max(64).optional()
  })
  .superRefine((data, ctx) => {
    if (data.role === 'DOCTOR' && !data.specialization_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'specialization_id is required when creating a doctor'
      });
    }
    if (data.role === 'RECEPTIONIST' && data.specialization_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Receptionists cannot be linked to a specialization'
      });
    }
  });

export type CreateStaffInput = z.infer<typeof CreateStaffSchema>;
