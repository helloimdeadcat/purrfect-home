import { z } from "zod";

const endpoint = z
  .url()
  .max(1024)
  .refine((value) => value.startsWith("https://"), "Endpoint must be https");

/** Body of POST /api/push/subscribe — PushSubscription.toJSON(). */
export const pushSubscribeSchema = z.object({
  endpoint,
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(128),
  }),
});

export const pushUnsubscribeSchema = z.object({ endpoint });

export type PushSubscribeInput = z.infer<typeof pushSubscribeSchema>;
