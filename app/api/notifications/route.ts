import {
  fromServiceError,
  handleRouteError,
  requireHousehold,
} from "@/lib/auth/api";
import { markNotificationsReadSchema } from "@/lib/validations/notification";
import {
  countUnreadNotifications,
  listNotifications,
  markNotificationsRead,
} from "@/services/notification-service";

export async function GET() {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const { supabase, ctx } = auth.value;
    const [list, unread] = await Promise.all([
      listNotifications(supabase, ctx),
      countUnreadNotifications(supabase, ctx),
    ]);
    if (list.error) return fromServiceError(list.error);
    if (unread.error) return fromServiceError(unread.error);

    return Response.json({ notifications: list.data, unread: unread.data });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireHousehold();
    if (!auth.ok) return auth.response;

    const input = markNotificationsReadSchema.parse(await request.json());
    const { error } = await markNotificationsRead(
      auth.value.supabase,
      auth.value.ctx,
      input.ids,
    );
    if (error) return fromServiceError(error);

    return Response.json({ ok: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
