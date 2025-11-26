import { z } from 'zod';

const uuid = () => z.string().uuid();

export const FileUploadSchema = z.object({
  case_id: uuid(),
  visit_id: uuid().optional(),
  category: z.enum(['intake', 'clinical']).optional()
});

export type FileUploadInput = z.infer<typeof FileUploadSchema>;
