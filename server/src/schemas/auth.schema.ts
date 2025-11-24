import { z } from 'zod';

export const StaffLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  totp_code: z.string().length(6).optional()
});

export const PatientLoginSchema = z.object({
  identifier: z.string().min(1),
  password: z.string().min(8)
});

export const PatientRegisterSchema = z.object({
  mrn: z.string().min(3),
  last_name: z.string().min(1),
  dob: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  email: z.string().email(),
  password: z.string().min(8)
});

export type StaffLoginInput = z.infer<typeof StaffLoginSchema>;
export type PatientLoginInput = z.infer<typeof PatientLoginSchema>;
export type PatientRegisterInput = z.infer<typeof PatientRegisterSchema>;
