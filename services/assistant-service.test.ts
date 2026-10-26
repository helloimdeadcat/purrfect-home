import { beforeEach, describe, expect, it, vi } from "vitest";

import { makeCtx } from "@/lib/test-utils/household-context";

const createTask = vi.fn();
vi.mock("@/services/settings-service", () => ({
  getHouseholdToday: async () => ({ today: "2026-10-26", timezone: "Europe/Berlin" }),
}));
vi.mock("@/services/task-service", async (original) => ({
  ...(await original<typeof import("@/services/task-service")>()),
  createTask: (...args: unknown[]) => createTask(...args),
}));
vi.mock("@/services/task-view-service", () => ({
  loadTaskView: async () => ({
    data: {
      people: {
        byMemberId: new Map([["c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", { label: "Alex" }]]),
        list: [],
      },
      taskById: new Map(),
      agenda: { overdue: [], byDate: {}, someday: [] },
    },
  }),
}));

const { runAssistant } = await import("./assistant-service");

const config = { apiKey: "test", baseUrl: "https://ai.example/", model: "m" };

/** Fake OpenAI-compatible endpoint answering with the scripted messages in order. */
function scriptedFetch(script: unknown[]) {
  const requests: { messages: { role: string; content?: string }[] }[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    requests.push(JSON.parse(String(init.body)));
    const message = script[Math.min(requests.length - 1, script.length - 1)];
    return new Response(JSON.stringify({ choices: [{ message }] }), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, requests };
}

const call = (name: string, args: unknown, id = "c1") => ({
  role: "assistant",
  content: null,
  tool_calls: [{ id, type: "function", function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) } }],
});

beforeEach(() => createTask.mockReset());

describe("runAssistant", () => {
  it("turns a propose_* call into a card without writing anything", async () => {
    const { fetchImpl, requests } = scriptedFetch([
      call("propose_create_task", {
        title: "Gym",
        who: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
        date: "2026-10-29",
        start_time: "19:00",
      }),
      { role: "assistant", content: "Предлагаю добавить тренировку в четверг ♥" },
    ]);
    const result = await runAssistant({} as never, makeCtx(), [{ role: "user", content: "Добавь Алексу спортзал в чт в 19" }], config, fetchImpl);

    expect(result.reply).toBe("Предлагаю добавить тренировку в четверг ♥");
    expect(result.proposals).toHaveLength(1);
    expect(result.proposals[0].summary).toBe('Add "Gym" for Alex · 2026-10-29 19:00');
    expect(createTask).not.toHaveBeenCalled();
    // The model is told the card awaits the user, and sees the system rules.
    expect(requests[0].messages[0].role).toBe("system");
    expect(JSON.stringify(requests[1].messages.at(-1))).toContain("shown_to_user");
  });

  it("reports invalid proposals and bad JSON back to the model instead of failing", async () => {
    const { fetchImpl, requests } = scriptedFetch([
      call("propose_create_task", { title: "", who: "together" }),
      call("get_overview", "{not json", "c2"),
      { role: "assistant", content: "ok" },
    ]);
    const result = await runAssistant({} as never, makeCtx(), [{ role: "user", content: "hi" }], config, fetchImpl);
    expect(result.proposals).toEqual([]);
    expect(JSON.stringify(requests[1].messages.at(-1))).toContain("Invalid arguments");
    expect(JSON.stringify(requests[2].messages.at(-1))).toContain("not valid JSON");
  });

  it("stops after a bounded number of tool rounds", async () => {
    const { fetchImpl } = scriptedFetch([call("get_agenda", { from: "2026-10-26", to: "2026-12-31" })]);
    const result = await runAssistant({} as never, makeCtx(), [{ role: "user", content: "loop" }], config, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(5);
    expect(result.reply).toMatch(/couldn't finish/);
  });
});
