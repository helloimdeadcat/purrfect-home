import { describe, expect, it } from "vitest";

import { parseProposal, proposalSchema } from "./tools";

const MEMBER = "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";
const TASK = "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11";

describe("parseProposal", () => {
  it("maps a schedule event with a weekly repeat", () => {
    const result = parseProposal("propose_create_task", {
      title: "Gym",
      who: MEMBER,
      date: "2026-10-29",
      start_time: "19:00",
      end_time: "20:30",
      repeat: { kind: "weekly", weekdays: [4, 1] },
    });
    expect(result).toEqual({
      ok: true,
      proposal: {
        type: "create_task",
        input: expect.objectContaining({
          title: "Gym",
          assigneeMemberId: MEMBER,
          startDate: "2026-10-29",
          startTime: "19:00",
          repeat: { kind: "weekly", interval: 1, weekdays: [1, 4] },
        }),
      },
    });
  });

  it('treats "together" as both partners and clears a time with ""', () => {
    const created = parseProposal("propose_create_task", { title: "Clean", who: "together" });
    expect(created.ok && created.proposal.type === "create_task" && created.proposal.input.assigneeMemberId).toBeNull();

    const updated = parseProposal("propose_update_task", { task_id: TASK, date: "2026-10-30", start_time: "" });
    expect(updated.ok && updated.proposal.type === "update_task" && updated.proposal.input).toEqual(
      expect.objectContaining({ startDate: "2026-10-30", startTime: null }),
    );
  });

  it("returns a readable error the model can fix", () => {
    const bad = parseProposal("propose_create_task", { title: "", who: "together" });
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.message).toMatch(/title/);
    const badTime = parseProposal("propose_create_task", { title: "X", who: "together", start_time: "25:00", date: "2026-10-30" });
    expect(badTime.ok).toBe(false);
    expect(parseProposal("propose_update_task", { task_id: "not-a-uuid", title: "x" }).ok).toBe(false);
    expect(parseProposal("drop_database", {}).ok).toBe(false);
  });

  it("clamps negative grams and re-validates on apply", () => {
    const result = parseProposal("propose_set_meal_portions", {
      meal_id: TASK,
      food_id: TASK,
      grams: [{ member_id: MEMBER, grams: -5 }],
    });
    expect(result.ok && result.proposal.type === "set_meal_portions" && result.proposal.input.grams[0].grams).toBe(0);
    expect(proposalSchema.safeParse({ type: "rename_meal", mealId: "x", title: "y" }).success).toBe(false);
  });
});
