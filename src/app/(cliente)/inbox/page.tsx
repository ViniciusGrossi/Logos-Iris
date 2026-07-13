"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaBadge } from "@/components/persona-badge";
import { MessageBubble } from "@/components/message-bubble";
import { EmptyState } from "@/components/empty-state";
import { StateSwitcher, type ScreenState } from "@/components/state-switcher";
import { conversations, messagesByConversation } from "@/mocks/conversations";
import type { Persona } from "@/mocks/types";
import { cn } from "@/lib/utils";

const thinkingClass: Record<Persona, string> = {
  atendimento: "bg-atendimento",
  vendas: "bg-vendas",
  agendamento: "bg-agendamento",
  sdr: "bg-sdr",
};

export default function InboxPage() {
  return (
    <Suspense>
      <InboxScreen />
    </Suspense>
  );
}

function InboxScreen() {
  const searchParams = useSearchParams();
  const [screenState, setScreenState] = useState<ScreenState>("content");
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get("c"));

  const selected = conversations.find((c) => c.id === selectedId) ?? null;
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end border-b border-border px-4 py-2 md:px-6">
        <StateSwitcher value={screenState} onChange={setScreenState} />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside
          className={cn(
            "w-full shrink-0 animate-in overflow-y-auto border-border duration-base ease-out-exp fade-in slide-in-from-left-2 md:w-80 md:border-r",
            selected && "hidden md:block"
          )}
        >
          {screenState === "loading" && <ConversationListSkeleton />}
          {screenState === "empty" && (
            <EmptyState message="Nenhuma conversa ainda. Assim que alguém chamar, eu te mostro aqui." />
          )}
          {screenState === "content" &&
            conversations.map((c, i) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                style={{ animationDelay: `${i * 40}ms` }}
                className={cn(
                  "flex w-full animate-in items-start gap-3 border-b border-border px-4 py-3 text-left duration-base ease-out-exp fade-in slide-in-from-bottom-1 hover:-translate-y-px hover:bg-bg-subtle hover:shadow-sm",
                  selectedId === c.id && "bg-bg-subtle"
                )}
              >
                <Avatar>
                  <AvatarFallback>{c.contactInitial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{c.contactName}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{c.lastMessageAt}</span>
                  </div>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.lastMessagePreview}</p>
                  <div className="mt-1.5 flex items-center gap-2">
                    <PersonaBadge persona={c.persona} />
                    {c.unread && (
                      <span className="relative flex size-1.5" aria-hidden>
                        <span className="absolute inline-flex size-full animate-ping rounded-full bg-foreground/50" />
                        <span className="relative inline-flex size-1.5 rounded-full bg-foreground" />
                      </span>
                    )}
                  </div>
                </div>
              </button>
            ))}
        </aside>

        <section
          key={selected?.id ?? "empty"}
          className={cn(
            "flex min-h-0 flex-1 animate-in flex-col duration-base ease-out-exp fade-in slide-in-from-right-2",
            !selected && "hidden md:flex"
          )}
        >
          {screenState !== "content" || !selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {screenState === "loading" ? <Skeleton className="h-6 w-40" /> : "Selecione uma conversa"}
            </div>
          ) : (
            <>
              <div className="flex shrink-0 items-center gap-3 border-b border-border px-4 py-3">
                <button className="md:hidden" onClick={() => setSelectedId(null)} aria-label="Voltar">
                  <ArrowLeft className="size-4" />
                </button>
                <Avatar>
                  <AvatarFallback>{selected.contactInitial}</AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{selected.contactName}</div>
                  <PersonaBadge persona={selected.persona} className="mt-0.5" />
                </div>
                <Button variant="outline" size="sm">
                  Pausar
                </Button>
              </div>
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} message={m} style={{ animationDelay: `${i * 60}ms` }} />
                ))}
                <ThinkingIndicator persona={selected.persona} />
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationListSkeleton() {
  return (
    <div>
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="flex items-start gap-3 border-b border-border px-4 py-3">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3 w-2/3" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ThinkingIndicator({ persona }: { persona: Persona }) {
  return (
    <div className="flex justify-start">
      <div className="flex items-center gap-1.5 rounded-2xl bg-secondary px-4 py-2.5">
        <span className={cn("size-1.5 animate-pulse rounded-full", thinkingClass[persona])} aria-hidden />
        <span className="text-xs text-muted-foreground">Iris está pensando</span>
      </div>
    </div>
  );
}
