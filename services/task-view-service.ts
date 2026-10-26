import type { SupabaseClient } from "@supabase/supabase-js";

import type { HouseholdContext } from "@/lib/auth/household";
import { canAdmin, canWrite } from "@/lib/auth/household";
import type { Agenda, AgendaItem } from "@/lib/calculations/task-schedule";
import { buildPeople, personFor, type Person } from "@/lib/people";
import { describeRepeat } from "@/lib/tasks/describe";
import { listFamilyMembers } from "@/services/family-service";
import { getAgenda, rowToRepeat, type TaskRow } from "@/services/task-service";
import type { Database } from "@/types/database";

type AppSupabase = SupabaseClient<Database>;

/** Everything the to-do and schedule pages render, already resolved. */
export type TaskView = {
  today: string;
  agenda: Agenda;
  taskById: Map<string, TaskRow>;
  people: ReturnType<typeof buildPeople>;
  /** Options for the "Who" select: Together first, then members. */
  personOptions: { memberId: string | null; label: string; color: string }[];
  personOf: (item: AgendaItem) => Person;
  repeatLabelOf: (item: AgendaItem) => string | null;
  canEdit: boolean;
  canDeleteTask: (task: TaskRow | undefined) => boolean;
  /** The signed-in user's member id (default assignee for new items). */
  myMemberId: string;
};

export async function loadTaskView(
  supabase: AppSupabase,
  ctx: HouseholdContext,
  range: { from: string; to: string },
): Promise<{ data: TaskView | null; error: string | null }> {
  const [agendaResult, membersResult] = await Promise.all([
    getAgenda(supabase, ctx, range),
    listFamilyMembers(supabase, ctx),
  ]);
  if (agendaResult.error || !agendaResult.data) {
    return { data: null, error: agendaResult.error?.message ?? "Could not load tasks" };
  }

  const people = buildPeople(membersResult.data ?? [], ctx.user.id);
  const taskById = new Map(agendaResult.data.tasks.map((task) => [task.id, task]));

  return {
    data: {
      today: agendaResult.data.today,
      agenda: agendaResult.data.agenda,
      taskById,
      people,
      personOptions: [
        people.together,
        ...people.list.map((p) => ({ ...p, label: p.isYou ? `${p.label} (you)` : p.label })),
      ],
      personOf: (item) => personFor(people, item.assigneeMemberId),
      repeatLabelOf: (item) => {
        const task = taskById.get(item.taskId);
        return task ? describeRepeat(rowToRepeat(task)) : null;
      },
      canEdit: canWrite(ctx.role),
      canDeleteTask: (task) =>
        Boolean(task) && canWrite(ctx.role) && (canAdmin(ctx.role) || task!.created_by === ctx.user.id),
      myMemberId: ctx.membershipId,
    },
    error: membersResult.error?.message ?? null,
  };
}

/** Filter by person: "all", "together" or a member id. */
export function matchesWho(item: AgendaItem, who: string): boolean {
  if (who === "all") return true;
  if (who === "together") return item.assigneeMemberId === null;
  return item.assigneeMemberId === who;
}
