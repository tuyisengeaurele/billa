import { z } from "zod";

export const contactMessageSchema = z.object({
  name: z.string().trim().min(1, "Enter your name"),
  email: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().min(10, "Tell us a bit more, at least 10 characters"),
});
export type ContactMessageInput = z.infer<typeof contactMessageSchema>;
