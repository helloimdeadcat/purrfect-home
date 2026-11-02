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
        <h1 className="text-2xl font-semibold">Морти ✨</h1>
        <p className="text-muted-foreground">
          Попроси рецепт сегодняшнего блюда, перенеси что-нибудь в расписании
          или узнай, как проходит неделя.
        </p>
      </div>
      {configured ? null : (
        <p className="card-soft p-4 text-sm" role="status">
          Морти пока не настроен. Возьми бесплатный ключ на aistudio.google.com,
          добавь <code className="rounded bg-muted px-1">AI_API_KEY=…</code> в{" "}
          <code className="rounded bg-muted px-1">.env.local</code> и перезапусти приложение.
        </p>
      )}
      <AssistantChat initialQuestion={typeof q === "string" ? q.slice(0, 500) : undefined} />
    </div>
  );
}
