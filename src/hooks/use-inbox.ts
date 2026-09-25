"use client";

// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Troca a fonte de dados de @/mocks/conversations por ListConversations/GetConversationMessages
// reais (Requisitos 1/2) — o desenho de tela (Fase 4, aprovado) não muda, só o hook. Mapeia o DTO
// real (contact_nome/persona_ativa/...) pro shape que os componentes já consomem (Conversation/
// Message de @/mocks/types), sem tocar em InboxPage além do necessário pro pausar/retomar
// (Requisitos 3/4).

import { useState, useEffect, useMemo, useCallback } from "react";
import type { Conversation, Message, Persona } from "@/mocks/types";
import { formatShortTime } from "@/lib/format-time";

export type InboxScreenState = "loading" | "empty" | "error" | "content";

interface UseInboxReturn {
  state: InboxScreenState;
  /** Achado do /code-review: `setState` não refazia o fetch no retry — expõe `retry` explícito. */
  retry: () => void;
  conversations: Conversation[];
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  selected: Conversation | null;
  messages: Message[];
  search: string;
  setSearch: (v: string) => void;
  personaFilter: string;
  setPersonaFilter: (v: string) => void;
  filteredConversations: Conversation[];
  errorMessage: string;
  /** Requisito 3/4 — pausar é imediato; retomar pode exigir confirmação explícita do dono. */
  pauseSelected: () => Promise<void>;
  resumeSelected: () => Promise<void>;
  showResumeConfirm: boolean;
  confirmResume: () => Promise<void>;
  cancelResumeConfirm: () => void;
  actionPending: boolean;
  /** Falha de pausar/retomar/confirmar — nunca fica muda: o botão volta ao estado anterior. */
  actionError: string | null;
}

function toConversation(row: {
  id: string;
  contact_nome: string | null;
  contact_telefone: string;
  persona_ativa: string;
  status: string;
  ultima_mensagem_preview: string;
  ultima_mensagem_em: string;
}): Conversation {
  const nome = row.contact_nome ?? row.contact_telefone;
  return {
    id: row.id,
    contactName: nome,
    contactInitial: nome.charAt(0).toUpperCase(),
    lastMessagePreview: row.ultima_mensagem_preview,
    lastMessageAt: row.ultima_mensagem_em ? formatShortTime(row.ultima_mensagem_em) : "",
    persona: row.persona_ativa as Persona,
    status: row.status as Conversation["status"],
    // Sem coluna de "lida/não lida" no backend ainda (não existe no contrato de ListConversations) —
    // nunca inventado; o indicador visual só volta a acender quando essa feature existir de verdade.
    unread: false,
  };
}

function toMessage(row: { id: string; direcao: string; conteudo: string; created_at: string }): Message {
  return {
    id: row.id,
    direction: row.direcao as Message["direction"],
    content: row.conteudo,
    sentAt: formatShortTime(row.created_at),
  };
}

export function useInbox(): UseInboxReturn {
  const [state, setState] = useState<InboxScreenState>("loading");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [search, setSearch] = useState("");
  const [personaFilter, setPersonaFilter] = useState("all");
  const [showResumeConfirm, setShowResumeConfirm] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const errorMessage = "Erro ao carregar conversas. Verifique sua conexão.";

  const loadConversations = useCallback(async () => {
    setState((s) => (s === "content" ? s : "loading"));
    try {
      const res = await fetch("/api/conversations?limit=50");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = (await res.json()) as { items: Parameters<typeof toConversation>[0][] };
      const mapped = body.items.map(toConversation);
      setConversations(mapped);
      setState(mapped.length === 0 ? "empty" : "content");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  const retry = useCallback(() => void loadConversations(), [loadConversations]);

  useEffect(() => {
    if (!selectedId) {
      setMessages([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/conversations/${selectedId}/messages?limit=100`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const body = (await res.json()) as { items: Parameters<typeof toMessage>[0][] };
        if (!cancelled) setMessages(body.items.map(toMessage));
      } catch {
        if (!cancelled) setMessages([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const filteredConversations = useMemo(() => {
    return conversations.filter((c) => {
      const matchSearch = c.contactName.toLowerCase().includes(search.toLowerCase());
      const matchPersona = personaFilter === "all" || c.persona === personaFilter;
      return matchSearch && matchPersona;
    });
  }, [conversations, search, personaFilter]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Achado do /code-review: nenhuma das 3 ações conferia res.ok — uma pausa/retomada rejeitada
  // pelo servidor (ex.: conversa encerrada, 500) recarregava a lista como se tivesse funcionado,
  // sem avisar o dono. Agora toda falha vira actionError, nunca um "sucesso" silencioso.
  const pauseSelected = useCallback(async () => {
    if (!selectedId) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/pause`, { method: "POST" });
      if (!res.ok) {
        setActionError("Não foi possível pausar esta conversa. Tente de novo.");
        return;
      }
      await loadConversations();
    } catch {
      setActionError("Não foi possível pausar esta conversa. Tente de novo.");
    } finally {
      setActionPending(false);
    }
  }, [selectedId, loadConversations]);

  const resumeSelected = useCallback(async () => {
    if (!selectedId) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmado_pelo_dono: false }),
      });
      if (!res.ok) {
        setActionError("Não foi possível retomar esta conversa. Tente de novo.");
        return;
      }
      const body = (await res.json()) as { status?: string };
      // Requisito 4 — nunca reativa silenciosamente: pausa longa exige confirmação explícita ANTES
      // de reenviar confirmado_pelo_dono=true.
      if (body.status === "aguardando_confirmacao") {
        setShowResumeConfirm(true);
        return;
      }
      await loadConversations();
    } catch {
      setActionError("Não foi possível retomar esta conversa. Tente de novo.");
    } finally {
      setActionPending(false);
    }
  }, [selectedId, loadConversations]);

  const confirmResume = useCallback(async () => {
    if (!selectedId) return;
    setActionPending(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmado_pelo_dono: true }),
      });
      if (!res.ok) {
        setActionError("Não foi possível confirmar a retomada. Tente de novo.");
        return;
      }
      setShowResumeConfirm(false);
      await loadConversations();
    } catch {
      setActionError("Não foi possível confirmar a retomada. Tente de novo.");
    } finally {
      setActionPending(false);
    }
  }, [selectedId, loadConversations]);

  const cancelResumeConfirm = useCallback(() => setShowResumeConfirm(false), []);

  return {
    state,
    retry,
    conversations,
    selectedId,
    setSelectedId,
    selected,
    messages,
    search,
    setSearch,
    personaFilter,
    setPersonaFilter,
    filteredConversations,
    errorMessage,
    pauseSelected,
    resumeSelected,
    showResumeConfirm,
    confirmResume,
    cancelResumeConfirm,
    actionPending,
    actionError,
  };
}
