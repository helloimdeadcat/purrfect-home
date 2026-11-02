import { z } from "zod";

export const createShoppingItemSchema = z.object({
  title: z.string().trim().min(1).max(200),
  note: z.string().trim().max(240).nullable().optional(),
});

export const updateShoppingItemSchema = z
  .object({
    title: z.string().trim().min(1).max(200).optional(),
    note: z.string().trim().max(240).nullable().optional(),
    isDone: z.boolean().optional(),
  })
  .refine(
    (value) =>
      value.title !== undefined ||
      value.note !== undefined ||
      value.isDone !== undefined,
    { message: "Нечего обновлять" },
  );

export type CreateShoppingItemInput = z.infer<typeof createShoppingItemSchema>;
export type UpdateShoppingItemInput = z.infer<typeof updateShoppingItemSchema>;
