import { z } from "zod";
import { DOCUMENT_TYPES, DOCUMENT_TEMPLATES } from "./document-types.js";

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export const businessProfileSchema = z
  .object({
    name: z.string().trim().min(1).optional(),
    tin: z.string().trim().min(1).nullable().optional(),
    industry: z.string().trim().min(1).nullable().optional(),
    phone: z.string().trim().min(1).nullable().optional(),
    email: z.string().email().nullable().optional(),
    address: z.string().trim().min(1).nullable().optional(),
    rraEbmNumber: z.string().trim().min(1).nullable().optional(),
    bankName: z.string().trim().min(1).nullable().optional(),
    bankAccountNumber: z.string().trim().min(1).nullable().optional(),
    signatoryName: z.string().trim().min(1).nullable().optional(),
    signatoryTitle: z.string().trim().min(1).nullable().optional(),
    defaultTemplate: z.enum(DOCUMENT_TEMPLATES).optional(),
    primaryColor: z.string().regex(hexColorPattern, "Enter a valid hex color").nullable().optional(),
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
  .max(DOCUMENT_TYPES.length)
  .refine((items) => new Set(items.map((i) => i.type)).size === items.length, {
    message: "duplicate type in sequence update",
  });
