import { z } from "zod";

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  password: z.string().min(8, "Password must be at least 8 characters."),
  fullName: z.string().trim().min(1, "Name is required.").max(100),
});
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, "Password is required."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const APPLICATION_STATUSES = ["WISHLIST", "APPLIED", "INTERVIEWING", "OFFER", "REJECTED", "WITHDRAWN"] as const;

export const createApplicationSchema = z.object({
  company: z.string().trim().min(1, "Company is required.").max(120),
  role: z.string().trim().min(1, "Role is required.").max(120),
  url: z.string().trim().url("Enter a valid URL.").optional().or(z.literal("")),
  status: z.enum(APPLICATION_STATUSES).default("APPLIED"),
  notes: z.string().trim().max(4000).optional(),
  appliedAt: z.coerce.date().optional(),
});
export type CreateApplicationInput = z.infer<typeof createApplicationSchema>;

// Same shape, but every field optional — a PATCH only sends what changed.
export const updateApplicationSchema = createApplicationSchema.partial();
export type UpdateApplicationInput = z.infer<typeof updateApplicationSchema>;

export const addEventSchema = z.object({
  note: z.string().trim().min(1, "Note can't be empty.").max(2000),
});
export type AddEventInput = z.infer<typeof addEventSchema>;

export const listApplicationsQuerySchema = z.object({
  status: z.enum(APPLICATION_STATUSES).optional(),
});

export const addResumeBulletSchema = z.object({
  text: z.string().trim().min(1, "Bullet text is required.").max(500, "Keep a bullet under 500 characters."),
});
export type AddResumeBulletInput = z.infer<typeof addResumeBulletSchema>;

export const matchApplicationSchema = z.object({
  jobDescription: z.string().trim().min(20, "Paste the full job description (at least 20 characters).").max(20000),
});
export type MatchApplicationInput = z.infer<typeof matchApplicationSchema>;
