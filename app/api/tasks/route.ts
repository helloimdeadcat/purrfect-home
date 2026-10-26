import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { agendaQuerySchema, createTaskSchema } from "@/lib/validations/task";
import { createTask, getAgenda } from "@/services/task-service";

/** GET /api/tasks?from=YYYY-MM-DD&to=YYYY-MM-DD → agenda (+ overdue, someday). */
export async function GET(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const params = new URL(request.url).searchParams;
    const range = agendaQuerySchema.parse({
      from: params.get("from") ?? undefined,
      to: params.get("to") ?? undefined,
    });
    const { data, error } = await getAgenda(auth.value.supabase, auth.value.ctx, range);
    if (error || !data) return fromServiceError(error ?? { code: "DB", message: "Failed" });

    return Response.json({ agenda: data.agenda, today: data.today });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = createTaskSchema.parse(await request.json());
    const { data, error } = await createTask(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ task: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
