import { z } from "zod";

import { AiError } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { assistantLimiter } from "@/lib/ai/rate-limit";
import { handleRouteError, requireHousehold } from "@/lib/auth/api";
import { jsonError } from "@/lib/auth/errors";
import { runAssistant } from "@/services/assistant-service";

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
    .min(1)
    .max(20)
    .refine((m) => m[m.length - 1].role === "user", { message: "The last message must be from the user" }),
});

/** POST { messages } → { reply, proposals } — proposals are never applied here. */
export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const config = getAiConfig();
    if (!config) {
      return jsonError(503, "The assistant isn't set up yet: add AI_API_KEY to .env.local and restart the app.");
    }
    if (!assistantLimiter.take(auth.value.ctx.user.id)) {
      return jsonError(429, "That's a lot of questions — take a short break and try again in a few minutes ♥");
    }

    const { messages } = bodySchema.parse(await request.json());
    const result = await runAssistant(auth.value.supabase, auth.value.ctx, messages, config);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiError) {
      return jsonError(error.kind === "rate_limited" ? 429 : 502, error.message);
    }
    return handleRouteError(error);
  }
}
