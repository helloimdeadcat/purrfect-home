import { z } from "zod";

/**
 * "молоко, хлеб; яйца" → separate titles. Also accepts fullwidth commas.
 * Empty chunks are dropped; each title is capped at 200 chars.
 */
export function splitShoppingTitles(raw: string): string[] {
  const seen = new Set<string>();
  const titles: string[] = [];
  for (const part of raw.split(/[,;，、]+/)) {
    const title = part.trim().slice(0, 200);
    if (!title) continue;
    const key = title.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    titles.push(title);
  }
  return titles;
}

export const createShoppingItemSchema = z.object({
  // Allow a longer paste; server splits into ≤200-char titles.
  title: z.string().trim().min(1).max(2000),
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
