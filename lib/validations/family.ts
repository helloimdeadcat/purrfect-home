import { z } from "zod";

export const updateHouseholdSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
});

export const createInvitationSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Enter a valid email")),
  // Role is fixed server-side to member; reject attempts to elevate via client
  role: z.literal("member").optional().default("member"),
});

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(20, "Invalid invitation"),
});

export type UpdateHouseholdInput = z.infer<typeof updateHouseholdSchema>;
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type AcceptInvitationInput = z.infer<typeof acceptInvitationSchema>;
