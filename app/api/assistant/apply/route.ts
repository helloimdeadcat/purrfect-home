import { z } from "zod";

import { proposalSchema } from "@/lib/ai/tools";
import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { applyProposal } from "@/services/assistant-service";

/**
 * POST { proposal } — apply a card the user confirmed. Re-validated here and
 * executed through the normal services, so it can do nothing the user
 * couldn't do through the regular forms.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { proposal } = z.object({ proposal: proposalSchema }).parse(await request.json());
    const { error } = await applyProposal(auth.value.supabase, auth.value.ctx, proposal);
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
