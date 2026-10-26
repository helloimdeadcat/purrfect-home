import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { createHabitSchema } from "@/lib/validations/habit";
import { createHabit, loadHabitBoard } from "@/services/habit-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { data, error } = await loadHabitBoard(auth.value.supabase, auth.value.ctx);
    if (error || !data) return fromServiceError(error ?? { code: "DB", message: "Failed" });

    return Response.json({
      today: data.today,
      habits: data.habits.map(({ habit, participants }) => ({
        habit,
        participants: participants.map((p) => ({
          memberId: p.person.memberId,
          label: p.person.label,
          isYou: p.isYou,
          todayValue: p.todayValue,
          streak: p.streak,
          rate30: p.rate30,
          thisWeek: p.thisWeek,
          strip: p.strip,
        })),
      })),
    });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = createHabitSchema.parse(await request.json());
    const { data, error } = await createHabit(auth.value.supabase, auth.value.ctx, input);
    if (error) return fromServiceError(error);

    return Response.json({ habit: data }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}
