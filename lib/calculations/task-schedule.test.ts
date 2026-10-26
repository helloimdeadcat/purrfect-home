import { describe, expect, it } from "vitest";

import {
  buildAgenda,
  expandOccurrences,
  isoWeekday,
  weekStart,
  type AgendaTask,
} from "./task-schedule";

describe("date helpers", () => {
  it("uses ISO weekdays and Monday week starts", () => {
    expect(isoWeekday("2026-10-26")).toBe(1); // Monday
    expect(isoWeekday("2026-11-01")).toBe(7); // Sunday
    expect(weekStart("2026-11-01")).toBe("2026-10-26");
  });
});

describe("expandOccurrences", () => {
  it("one-off: only its own date, undated: nothing", () => {
    expect(expandOccurrences({ startDate: "2026-10-28", repeat: { kind: "none" } }, "2026-10-26", "2026-11-01")).toEqual(["2026-10-28"]);
    expect(expandOccurrences({ startDate: "2026-10-20", repeat: { kind: "none" } }, "2026-10-26", "2026-11-01")).toEqual([]);
    expect(expandOccurrences({ startDate: null, repeat: { kind: "none" } }, "2026-10-26", "2026-11-01")).toEqual([]);
  });

  it("daily every N days stays on the start date's rhythm", () => {
    expect(
      expandOccurrences({ startDate: "2026-10-20", repeat: { kind: "daily", interval: 3 } }, "2026-10-26", "2026-11-04"),
    ).toEqual(["2026-10-26", "2026-10-29", "2026-11-01", "2026-11-04"]);
  });

  it("weekdays (Mon–Fri) skip the weekend", () => {
    expect(
      expandOccurrences(
        { startDate: "2026-10-01", repeat: { kind: "weekly", interval: 1, weekdays: [1, 2, 3, 4, 5] } },
        "2026-10-30",
        "2026-11-03",
      ),
    ).toEqual(["2026-10-30", "2026-11-02", "2026-11-03"]);
  });

  it("every other week on Tue + Thu, anchored on the start week", () => {
    expect(
      expandOccurrences(
        { startDate: "2026-10-27", repeat: { kind: "weekly", interval: 2, weekdays: [2, 4] } },
        "2026-10-26",
        "2026-11-15",
      ),
    ).toEqual(["2026-10-27", "2026-10-29", "2026-11-10", "2026-11-12"]);
  });

  it("monthly on the 31st clamps to short months and keeps the anchor", () => {
    expect(
      expandOccurrences(
        { startDate: "2026-01-31", repeat: { kind: "monthly", interval: 1, dayOfMonth: 31 } },
        "2026-01-01",
        "2026-04-30",
      ),
    ).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
  });

  it("every 3 months, respects repeatUntil", () => {
    expect(
      expandOccurrences(
        { startDate: "2026-01-15", repeat: { kind: "monthly", interval: 3, dayOfMonth: 15 }, repeatUntil: "2026-09-30" },
        "2026-01-01",
        "2026-12-31",
      ),
    ).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
  });

  it("never yields dates before the start", () => {
    expect(
      expandOccurrences({ startDate: "2026-11-02", repeat: { kind: "daily", interval: 1 } }, "2026-10-30", "2026-11-03"),
    ).toEqual(["2026-11-02", "2026-11-03"]);
  });
});

function task(overrides: Partial<AgendaTask>): AgendaTask {
  return {
    id: "t",
    title: "Task",
    kind: "task",
    startDate: null,
    repeat: { kind: "none" },
    repeatUntil: null,
    startTime: null,
    endTime: null,
    assigneeMemberId: null,
    completedAt: null,
    ...overrides,
  };
}

describe("buildAgenda", () => {
  const range = { from: "2026-10-26", to: "2026-11-01", today: "2026-10-26" };

  it("groups by date, timed items first, and marks repeating completions per date", () => {
    const agenda = buildAgenda({
      ...range,
      tasks: [
        task({ id: "trash", title: "Take out trash", startDate: "2026-10-01", repeat: { kind: "weekly", interval: 1, weekdays: [1, 4] } }),
        task({ id: "gym", title: "Gym", kind: "event", startDate: "2026-10-26", startTime: "19:00", endTime: "20:30" }),
      ],
      completions: new Map([["trash", new Set(["2026-10-26"])]]),
    });
    expect(agenda.byDate["2026-10-26"].map((i) => [i.taskId, i.done])).toEqual([
      ["gym", false],
      ["trash", true],
    ]);
    expect(agenda.byDate["2026-10-29"].map((i) => [i.taskId, i.done])).toEqual([["trash", false]]);
  });

  it("keeps open past one-offs as overdue and lists undated tasks as someday", () => {
    const agenda = buildAgenda({
      ...range,
      tasks: [
        task({ id: "old", title: "Call landlord", startDate: "2026-10-20" }),
        task({ id: "oldDone", title: "Done", startDate: "2026-10-20", completedAt: "2026-10-21T10:00:00Z" }),
        task({ id: "someday", title: "Fix shelf" }),
      ],
      completions: new Map(),
    });
    expect(agenda.overdue.map((i) => i.taskId)).toEqual(["old"]);
    expect(agenda.someday.map((i) => i.taskId)).toEqual(["someday"]);
  });

  it("does not turn missed occurrences of repeating tasks into overdue items", () => {
    const agenda = buildAgenda({
      ...range,
      tasks: [task({ id: "water", startDate: "2026-10-01", repeat: { kind: "daily", interval: 1 } })],
      completions: new Map(),
    });
    expect(agenda.overdue).toEqual([]);
    expect(Object.keys(agenda.byDate)).toHaveLength(7);
  });
});
