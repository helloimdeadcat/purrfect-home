import { z } from "zod";

/** Omit `ids` to mark every unread notification as read. */
export const markNotificationsReadSchema = z.object({
  ids: z.array(z.uuid()).max(200).optional(),
});

export type MarkNotificationsReadInput = z.infer<typeof markNotificationsReadSchema>;

export const auditLogQuerySchema = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
});
