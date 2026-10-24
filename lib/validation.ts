import { z } from 'zod';
export const email = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const loginSchema = z.object({ email, password: z.string().min(1).max(200) });
export const registerSchema = z.object({
  fullName: z.string().trim().min(2).max(120), email,
  password: z.string().min(10).max(128).regex(/[A-Z]/, 'Use an uppercase letter')
    .regex(/[0-9]/, 'Use a digit'),
});
export const productSchema = z.object({
  modelId: z.uuid(), policyId: z.uuid(), serialNumber: z.string().trim().min(5).max(100),
  purchaseDate: z.iso.date(),
});
export const claimSchema = z.object({
  warrantyId: z.uuid(), issue: z.string().trim().min(15).max(3000),
  evidenceUrl: z.union([z.url({ protocol: /^https?$/ }), z.literal('')]).optional(),
  evidenceNote: z.string().max(250).optional(),
});
export const decisionSchema = z.object({
  verdict: z.enum(['approved','rejected']), reason: z.string().trim().min(20).max(3000),
});
export const policyDocumentSchema = z.object({
  title: z.string().trim().min(4).max(150),
  text: z.string().trim().min(50).max(50000),
});
