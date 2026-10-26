import { AssistantChat } from "@/components/assistant/assistant-chat";
import { getAiConfig } from "@/lib/ai/config";

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function AssistantPage({ searchParams }: Props) {
  const { q } = await searchParams;
  const configured = getAiConfig() !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold">Assistant ✨</h1>
        <p className="text-muted-foreground">
          Ask for a recipe from today&apos;s meal, move things in your schedule,
          or check how the week is going.
        </p>
      </div>
      {configured ? null : (
        <p className="card-soft p-4 text-sm" role="status">
          The assistant isn&apos;t set up yet. Get a free key at aistudio.google.com,
          add <code className="rounded bg-muted px-1">AI_API_KEY=…</code> to{" "}
          <code className="rounded bg-muted px-1">.env.local</code> and restart the app.
        </p>
      )}
      <AssistantChat initialQuestion={typeof q === "string" ? q.slice(0, 500) : undefined} />
    </div>
  );
}
