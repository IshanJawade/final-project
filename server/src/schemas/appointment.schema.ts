import { z } from 'zod';

const uuid = () => z.string().uuid();

const statusEnum = z.enum(['SCHEDULED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']);

export const AppointmentListQuerySchema = z.object({
  status: statusEnum.optional(),
  doctor_id: uuid().optional(),
  patient_id: uuid().optional(),
  case_id: uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().min(1).max(100).default(50)
});

export const CreateAppointmentSchema = z
  .object({
    case_id: uuid(),
    start_time: z.string().datetime(),
    end_time: z.string().datetime()
  })
  .refine((payload) => new Date(payload.start_time) < new Date(payload.end_time), {
    message: 'end_time must be after start_time'
  });

export const UpdateAppointmentSchema = z
  .object({
    start_time: z.string().datetime().optional(),
    end_time: z.string().datetime().optional(),
    status: statusEnum.optional()
  })
  .refine((payload) => Object.values(payload).some((value) => value !== undefined), {
    message: 'At least one field must be provided'
  })
  .refine(
    (payload) => {
      if (payload.start_time && payload.end_time) {
        return new Date(payload.start_time) < new Date(payload.end_time);
      }
      return true;
    },
    { message: 'end_time must be after start_time' }
  );

export const AvailabilityQuerySchema = z.object({
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  include_booked: z.coerce.boolean().optional()
});

export type AppointmentListQueryInput = z.infer<typeof AppointmentListQuerySchema>;
export type CreateAppointmentInput = z.infer<typeof CreateAppointmentSchema>;
export type UpdateAppointmentInput = z.infer<typeof UpdateAppointmentSchema>;
export type AvailabilityQueryInput = z.infer<typeof AvailabilityQuerySchema>;
