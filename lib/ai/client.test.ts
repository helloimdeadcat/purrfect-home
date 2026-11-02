import { beforeEach, describe, expect, it, vi } from "vitest";

import { chatCompletion, resetModelHealth } from "@/lib/ai/client";
import { getAiConfig } from "@/lib/ai/config";

const ok = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function fakeFetch(byModel: Record<string, () => Response>) {
  const models: string[] = [];
  const fetchImpl = vi.fn(async (_url: string, init: RequestInit) => {
    const { model } = JSON.parse(String(init.body)) as { model: string };
    models.push(model);
    return byModel[model]();
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, models };
}

const input = { messages: [{ role: "user" as const, content: "hi" }] };

describe("getAiConfig", () => {
  it("adds the lite fallback by default and lets it be turned off", () => {
    expect(getAiConfig({ AI_API_KEY: "k" })).toMatchObject({ model: "gemini-flash-latest", fallbackModel: "gemini-flash-lite-latest" });
    expect(getAiConfig({ AI_API_KEY: "k", AI_FALLBACK_MODEL: "off" })?.fallbackModel).toBeUndefined();
    expect(getAiConfig({ AI_API_KEY: "k", AI_MODEL: "gemini-flash-lite-latest" })?.fallbackModel).toBeUndefined();
    expect(getAiConfig({})).toBeNull();
  });
});

describe("chatCompletion", () => {
  const config = { apiKey: "k", baseUrl: "https://ai.example/", model: "main", fallbackModel: "lite" };

  beforeEach(() => resetModelHealth());

  it("skips the main model for a while after it failed", async () => {
    const { fetchImpl, models } = fakeFetch({ main: () => new Response("busy", { status: 503 }), lite: () => ok("lite") });
    await chatCompletion(config, input, fetchImpl);
    await chatCompletion(config, input, fetchImpl);
    expect(models).toEqual(["main", "lite", "lite"]);
  });

  it("gives up without a request when the deadline has passed", async () => {
    const { fetchImpl, models } = fakeFetch({ main: () => ok("x"), lite: () => ok("x") });
    await expect(chatCompletion(config, { ...input, deadline: Date.now() - 1 }, fetchImpl)).rejects.toMatchObject({ kind: "timeout" });
    expect(models).toEqual([]);
  });

  it("uses the main model when it answers", async () => {
    const { fetchImpl, models } = fakeFetch({ main: () => ok("hello") });
    expect(await chatCompletion(config, input, fetchImpl)).toMatchObject({ content: "hello", model: "main" });
    expect(models).toEqual(["main"]);
  });

  it.each([503, 429, 500])("falls back to the lite model on HTTP %i", async (status) => {
    const { fetchImpl, models } = fakeFetch({ main: () => new Response("busy", { status }), lite: () => ok("from lite") });
    expect(await chatCompletion(config, input, fetchImpl)).toMatchObject({ content: "from lite", model: "lite" });
    expect(models).toEqual(["main", "lite"]);
  });

  it("does not hide a bad key behind the fallback", async () => {
    const { fetchImpl, models } = fakeFetch({ main: () => new Response("no", { status: 401 }), lite: () => ok("x") });
    await expect(chatCompletion(config, input, fetchImpl)).rejects.toMatchObject({ kind: "auth" });
    expect(models).toEqual(["main"]);
  });

  it("reports the error when both models fail", async () => {
    const { fetchImpl } = fakeFetch({ main: () => new Response("", { status: 503 }), lite: () => new Response("", { status: 503 }) });
    await expect(chatCompletion(config, input, fetchImpl)).rejects.toMatchObject({ kind: "upstream" });
  });
});
