import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(8).max(72),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(72),
});

const phoneValueSchema = z.union([
  z.string().trim().min(1),
  z.number().int().positive(),
]);

export const contactSchema = z.object({
  name: z.string().trim().min(1).max(100),
  phone: z.union([phoneValueSchema, z.array(phoneValueSchema).min(1).max(500)]),
  optedIn: z.literal(true),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
});
