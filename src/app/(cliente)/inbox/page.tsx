"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaBadge } from "@/components/persona-badge";
import { MessageBubble } from "@/components/message-bubble";
import { ErrorBoundary } from "@/components/ui-shared/error-boundary";
import { EmptyState } from "@/components/ui-shared/empty-state";
import { useInbox } from "@/hooks/use-inbox";
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
      <ErrorBoundary>
        <InboxScreen />
      </ErrorBoundary>
    </Suspense>
  );
}

function InboxScreen() {
  const searchParams = useSearchParams();
  const {
    state,
    retry,
    selectedId,
    setSelectedId,
    selected,
    messages,
    filteredConversations,
    errorMessage,
    pauseSelected,
    resumeSelected,
    showResumeConfirm,
    confirmResume,
    cancelResumeConfirm,
    actionPending,
    actionError,
  } = useInbox();

  // Inicializa selectedId da URL na primeira renderização
  const urlConvId = searchParams.get("c");
  if (urlConvId && selectedId === null) {
    setSelectedId(urlConvId);
  }

  if (state === "error") {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          title="Erro ao carregar conversas"
          description={errorMessage}
          action={
            <Button variant="outline" size="sm" onClick={retry}>
              Tentar novamente
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1">
        {/* ── Lista de conversas ── */}
        <aside
          className={cn(
            "w-full shrink-0 overflow-y-auto border-border md:w-80 md:border-r",
            selected && "hidden md:block"
          )}
        >
          {state === "loading" && <ConversationListSkeleton />}
          {state === "empty" && (
            <EmptyState
              title="Nenhuma conversa ainda"
              description="Assim que alguém chamar, eu te mostro aqui."
            />
          )}
          {state === "content" &&
            filteredConversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={cn(
                  "flex w-full items-start gap-3 border-b border-border px-4 py-3 text-left transition-all duration-[var(--duration-base)] ease-[var(--ease-out-exp)] hover:-translate-y-px hover:bg-bg-subtle hover:shadow-sm",
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

        {/* ── Painel de chat ── */}
        <section
          className={cn(
            "flex min-h-0 flex-1 flex-col",
            !selected && "hidden md:flex"
          )}
        >
          {!selected ? (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              Selecione uma conversa
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
                {/* Requisito 3/4 — pausar/retomar chama os endpoints reais (human-handoff.md);
                    retomar após pausa longa exige confirmação explícita antes de reativar. */}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={actionPending}
                  onClick={() => void (selected.status === "pausada" ? resumeSelected() : pauseSelected())}
                >
                  {selected.status === "pausada" ? "Retomar" : "Pausar"}
                </Button>
              </div>
              {actionError && !showResumeConfirm && (
                <div className="border-b border-border bg-destructive/10 px-4 py-2 text-sm text-destructive">
                  {actionError}
                </div>
              )}
              {showResumeConfirm && (
                <div className="flex items-center justify-between gap-3 border-b border-border bg-bg-subtle px-4 py-3 text-sm">
                  <span>Essa conversa ficou pausada por um tempo. Confirma que a Iris pode voltar a responder?</span>
                  <div className="flex shrink-0 gap-2">
                    <Button size="sm" variant="outline" onClick={cancelResumeConfirm} disabled={actionPending}>
                      Cancelar
                    </Button>
                    <Button size="sm" onClick={() => void confirmResume()} disabled={actionPending}>
                      Confirmar
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                {messages.map((m) => (
                  <MessageBubble key={m.id} message={m} />
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