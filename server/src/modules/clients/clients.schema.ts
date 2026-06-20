import { z } from 'zod';

/** Payload validation for clients. Field names mirror DB columns (snake_case). */
export const createClientSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  phone: z.string().min(1, 'Phone is required'),
  email: z.string().email().nullish(),
  company: z.string().nullish(),
  city: z.string().min(1, 'City is required'),
  state: z.string().nullish(),
  pincode: z.string().nullish(),
  whatsapp_number: z.string().nullish(),
  lead_source: z.string().nullish(),
  source: z.string().nullish(),
  service_type_interest: z.string().nullish(),
  requirement_notes: z.string().nullish(),
  notes: z.string().nullish(),
});

export const updateClientSchema = createClientSchema.partial().extend({
  email_bounced: z.boolean().optional(),
  whatsapp_invalid: z.boolean().optional(),
});

export const listClientsQuery = z.object({
  search: z.string().optional(),
  phone: z.string().optional(),
  order: z.enum(['name', 'created_at']).default('created_at'),
  include_deleted: z.coerce.boolean().default(false),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;
export type UpdateClientInput = z.infer<typeof updateClientSchema>;
export type ListClientsQuery = z.infer<typeof listClientsQuery>;
