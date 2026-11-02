/**
 * Live check of the AI provider with the key from .env.local (`npm run check:ai`).
 * Sends only made-up test questions — no household data leaves the machine:
 * the database is mocked exactly like in assistant-service.test.ts.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { chatCompletion } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";
import { ASSISTANT_TOOLS } from "@/lib/ai/tools";
import { makeCtx } from "@/lib/test-utils/household-context";

vi.mock("@/services/settings-service", () => ({
  getHouseholdToday: async () => ({ today: "2026-10-27", timezone: "Europe/Berlin" }),
}));
vi.mock("@/services/task-view-service", () => ({
  loadTaskView: async () => ({
    data: {
      people: {
        byMemberId: new Map([
          ["5f0c2a9e-6b1d-4c3e-9a7f-2d8e1b4c6a01", { label: "Owner" }],
          ["c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", { label: "Alex" }],
        ]),
        list: [
          { memberId: "5f0c2a9e-6b1d-4c3e-9a7f-2d8e1b4c6a01", label: "Owner", isYou: true },
          { memberId: "c0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11", label: "Alex", isYou: false },
        ],
      },
      taskById: new Map(),
      agenda: { overdue: [], byDate: {}, someday: [] },
    },
  }),
}));

const ME = "5f0c2a9e-6b1d-4c3e-9a7f-2d8e1b4c6a01";

const { runAssistant } = await import("./assistant-service");

function readEnvFile(): Record<string, string> {
  const env: Record<string, string> = {};
  const file = readFileSync(path.resolve(import.meta.dirname, "../.env.local"), "utf8");
  for (const line of file.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) env[match[1]] = match[2];
  }
  return env;
}

const config = getAiConfig({ ...readEnvFile(), ...process.env });

describe.runIf(config)("AI provider (live)", () => {
  it("accepts the key, the model and all tool schemas", async () => {
    const result = await chatCompletion(config!, {
      messages: [{ role: "user", content: "Ответь одним словом: работает?" }],
      tools: ASSISTANT_TOOLS,
    });
    console.log(`model ${config!.model}: ${result.content ?? `(tool calls: ${result.toolCalls.map((c) => c.function.name).join(", ")})`}`);
    expect(result.content || result.toolCalls.length).toBeTruthy();
  });

  it("answers as Morty", async () => {
    const result = await runAssistant({} as never, makeCtx({ membershipId: ME }), [{ role: "user", content: "Привет! Как тебя зовут? Ответь одним предложением." }], config!);
    console.log(`reply: ${result.reply}`);
    expect(result.reply).toMatch(/Морти|Morty/i);
  });

  it("proposes a to-do as a card instead of changing data", async () => {
    const loggingFetch: typeof fetch = async (url, init) => {
      const started = Date.now();
      const model = (JSON.parse(String(init?.body)) as { model: string }).model;
      const response = await fetch(url, init).catch((error: Error) => {
        console.log(`request ${model}: ${error.name} after ${Date.now() - started} ms`);
        throw error;
      });
      console.log(`request ${model}: HTTP ${response.status} in ${Date.now() - started} ms`);
      const data = (await response.clone().json().catch(() => null)) as { choices?: { message?: { tool_calls?: { function: { name: string; arguments: string } }[] } }[] } | null;
      for (const call of data?.choices?.[0]?.message?.tool_calls ?? []) console.log(`tool call: ${call.function.name} ${call.function.arguments}`);
      return response;
    };
    const result = await runAssistant({} as never, makeCtx({ membershipId: ME }), [{ role: "user", content: "Добавь мне дело «купить молоко» на завтра" }], config!, loggingFetch);
    console.log(`reply: ${result.reply}\ncards: ${result.proposals.map((p) => p.summary).join(" | ") || "(none)"}`);
    expect(result.proposals.map((p) => p.proposal.type)).toContain("create_task");
  });
});

describe.runIf(!config)("AI provider (live)", () => {
  it.skip("AI_API_KEY is not set in .env.local", () => {});
});
