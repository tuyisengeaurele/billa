import { z } from "zod";
import { DOCUMENT_TYPES } from "./document-types.js";

export const businessProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tin: z.string().trim().min(1).optional(),
    industry: z.string().trim().min(1).optional(),
    phone: z.string().trim().min(1).optional(),
    email: z.string().email().optional(),
    address: z.string().trim().min(1).optional(),
    rraEbmNumber: z.string().trim().min(1).optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: "at least one field is required",
  });
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;

export const documentSequenceSchema = z.object({
  type: z.enum(DOCUMENT_TYPES),
  prefix: z.string().min(1).max(10),
  nextNumber: z.number().int().positive(),
});
export type DocumentSequenceInput = z.infer<typeof documentSequenceSchema>;

export const updateSequencesSchema = z
  .array(documentSequenceSchema)
  .min(1)
  .max(5)
  .refine((items) => new Set(items.map((i) => i.type)).size === items.length, {
    message: "duplicate type in sequence update",
  });
