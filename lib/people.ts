/**
 * Stable colour + label per household member for schedule/to-do views.
 * Colours come from the validated categorical palette and follow join order
 * (never rank), so each partner keeps their colour everywhere.
 */

export type Person = {
  /** null = "together" (both partners) */
  memberId: string | null;
  label: string;
  /** CSS colour value (theme token) for dots, strips and chips. */
  color: string;
  isYou: boolean;
};

// Rose, teal, then sky, orchid, leaf, olive for larger households.
const MEMBER_COLORS = [
  "var(--chart-1)",
  "var(--chart-4)",
  "var(--chart-2)",
  "var(--chart-7)",
  "var(--chart-8)",
  "var(--chart-6)",
];
const TOGETHER_COLOR = "var(--chart-5)"; // lavender

export type PeopleMember = {
  id: string;
  user_id: string;
  display_name: string | null;
  email: string | null;
  joined_at: string;
};

export function buildPeople(
  members: PeopleMember[],
  currentUserId: string,
): { list: Person[]; together: Person; byMemberId: Map<string, Person> } {
  const ordered = [...members].sort((a, b) => a.joined_at.localeCompare(b.joined_at));
  const list = ordered.map((member, index) => ({
    memberId: member.id,
    label: member.display_name || member.email?.split("@")[0] || "Partner",
    color: MEMBER_COLORS[index % MEMBER_COLORS.length],
    isYou: member.user_id === currentUserId,
  }));
  return {
    list,
    together: { memberId: null, label: "Together", color: TOGETHER_COLOR, isYou: false },
    byMemberId: new Map(list.map((person) => [person.memberId, person])),
  };
}

export function personFor(
  people: ReturnType<typeof buildPeople>,
  memberId: string | null,
): Person {
  if (memberId === null) return people.together;
  return (
    people.byMemberId.get(memberId) ?? {
      memberId,
      label: "Former member",
      color: "var(--chart-neutral)",
      isYou: false,
    }
  );
}
