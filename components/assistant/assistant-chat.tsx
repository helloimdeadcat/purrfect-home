"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { CatFace } from "@/components/cute/illustrations";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { Proposal } from "@/lib/ai/tools";
import { cn } from "@/lib/utils";

type Card = { id: string; summary: string; proposal: Proposal; state: "open" | "applying" | "applied" | "dismissed"; error?: string };
type Turn = { role: "user" | "assistant"; content: string; cards?: Card[] };

const STORAGE_KEY = "purrfect-assistant-chat";
const QUICK_PROMPTS = [
  "Что у нас сегодня по плану?",
  "Подскажи рецепт для сегодняшнего ужина из наших продуктов",
  "Распредели домашние дела на эту неделю поровну",
  "Как у нас с привычками?",
  "Сколько у нас денег и как прошёл месяц?",
];

/** Chat history lives only in this browser tab (sessionStorage), never in the database. */
function loadHistory(): Turn[] {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Turn[]) : [];
  } catch {
    return [];
  }
}

export function AssistantChat({ initialQuestion }: { initialQuestion?: string }) {
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(initialQuestion ?? "");
  const endRef = useRef<HTMLDivElement>(null);
  const [restored, setRestored] = useState(false);

  useEffect(() => {
    // Restore after mount (sessionStorage is client-only) to avoid hydration mismatch.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTurns(loadHistory());
    setRestored(true);
  }, []);

  useEffect(() => {
    // Don't persist the empty initial state over the saved history before it's restored.
    if (!restored) return;
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-30)));
    } catch {
      // storage unavailable — the chat still works for this page view
    }
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, restored]);

  async function ask(question: string) {
    const text = question.trim();
    if (!text || pending) return;
    setError(null);
    const next: Turn[] = [...turns, { role: "user", content: text }];
    setTurns(next);
    setDraft("");
    setPending(true);
    try {
      const response = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 4000) })),
        }),
      });
      const data = (await response.json().catch(() => ({}))) as {
        reply?: string;
        proposals?: { id: string; summary: string; proposal: Proposal }[];
        error?: string;
      };
      if (!response.ok) {
        setError(data.error ?? "The assistant couldn't answer");
        return;
      }
      setTurns([
        ...next,
        {
          role: "assistant",
          content: data.reply ?? "",
          cards: (data.proposals ?? []).map((p) => ({ ...p, state: "open" as const })),
        },
      ]);
    } catch {
      setError("Network error");
    } finally {
      setPending(false);
    }
  }

  function updateCard(turnIndex: number, cardId: string, patch: Partial<Card>) {
    setTurns((all) =>
      all.map((turn, i) =>
        i === turnIndex
          ? { ...turn, cards: turn.cards?.map((card) => (card.id === cardId ? { ...card, ...patch } : card)) }
          : turn,
      ),
    );
  }

  async function apply(turnIndex: number, card: Card) {
    updateCard(turnIndex, card.id, { state: "applying", error: undefined });
    try {
      const response = await fetch("/api/assistant/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal: card.proposal }),
      });
      if (!response.ok) {
        const data = (await response.json().catch(() => ({}))) as { error?: string };
        updateCard(turnIndex, card.id, { state: "open", error: data.error ?? "Couldn't apply" });
        return;
      }
      updateCard(turnIndex, card.id, { state: "applied" });
      router.refresh();
    } catch {
      updateCard(turnIndex, card.id, { state: "open", error: "Network error" });
    }
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    void ask(draft);
  }

  return (
    <div className="grid gap-4">
      {turns.length === 0 ? (
        <div className="card-soft grid gap-3 p-4">
          <p className="text-sm text-muted-foreground">Try one of these:</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_PROMPTS.map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => void ask(prompt)}
                className="rounded-full border border-border bg-card px-3 py-1.5 text-left text-sm transition-colors hover:bg-secondary"
              >
                {prompt}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <ol className="grid gap-3" aria-live="polite">
        {turns.map((turn, index) => (
          <li key={index} className={cn("flex gap-2", turn.role === "user" && "justify-end")}>
            {turn.role === "assistant" ? <CatFace className="mt-1 size-8 shrink-0" /> : null}
            <div className={cn("grid max-w-[85%] gap-2", turn.role === "user" && "justify-items-end")}>
              <div
                className={cn(
                  "rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap",
                  turn.role === "user" ? "bg-primary text-primary-foreground" : "card-soft",
                )}
              >
                {turn.content}
              </div>
              {turn.cards?.map((card) => (
                <div key={card.id} className="grid gap-2 rounded-2xl border border-primary/30 bg-secondary/60 p-3 text-sm">
                  <p>
                    <span className="font-semibold">Suggestion:</span> {card.summary}
                  </p>
                  {card.state === "applied" ? (
                    <p className="font-medium text-income">Applied ♥</p>
                  ) : card.state === "dismissed" ? (
                    <p className="text-muted-foreground">Dismissed</p>
                  ) : (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" disabled={card.state === "applying"} onClick={() => void apply(index, card)}>
                        {card.state === "applying" ? "Applying…" : "Apply"}
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={() => updateCard(index, card.id, { state: "dismissed" })}>
                        Dismiss
                      </Button>
                    </div>
                  )}
                  {card.error ? (
                    <p className="text-xs text-destructive" role="alert">
                      {card.error}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </li>
        ))}
        {pending ? (
          <li className="flex items-center gap-2 text-sm text-muted-foreground">
            <CatFace className="size-8 animate-pulse" /> Thinking…
          </li>
        ) : null}
      </ol>
      <div ref={endRef} />

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <form onSubmit={onSubmit} className="card-soft sticky bottom-3 grid gap-2 p-3">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(draft);
            }
          }}
          rows={2}
          maxLength={4000}
          placeholder="Ask about meals, chores, habits or money…"
          aria-label="Message"
        />
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-xs text-muted-foreground underline-offset-4 hover:underline"
            onClick={() => {
              setTurns([]);
              setError(null);
            }}
          >
            Clear chat
          </button>
          <Button type="submit" disabled={pending || !draft.trim()}>
            Send
          </Button>
        </div>
      </form>
      <p className="text-xs text-muted-foreground">
        Answers come from Google Gemini: your question and the data it looks up
        (meals, to-dos, habits, balances) are sent to Google. The assistant only
        suggests changes — nothing happens until you tap Apply. See also{" "}
        <Link href="/app/tasks" className="underline underline-offset-4">
          To-do
        </Link>
        .
      </p>
    </div>
  );
}
