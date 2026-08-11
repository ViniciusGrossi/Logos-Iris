"use client";

import { useState, useMemo } from "react";
import { conversations as mockConversations, messagesByConversation } from "@/mocks/conversations";
import type { Conversation, Message } from "@/mocks/types";

export type InboxScreenState = "loading" | "empty" | "error" | "content";

interface UseInboxReturn {
  state: InboxScreenState;
  setState: (s: InboxScreenState) => void;
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
}

export function useInbox(): UseInboxReturn {
  const [state, setState] = useState<InboxScreenState>("content");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [personaFilter, setPersonaFilter] = useState("all");

  const filteredConversations = useMemo(() => {
    return mockConversations.filter((c) => {
      const matchSearch = c.contactName.toLowerCase().includes(search.toLowerCase());
      const matchPersona = personaFilter === "all" || c.persona === personaFilter;
      return matchSearch && matchPersona;
    });
  }, [search, personaFilter]);

  const selected = mockConversations.find((c) => c.id === selectedId) ?? null;
  const messages = selectedId ? messagesByConversation[selectedId] ?? [] : [];

  return {
    state,
    setState,
    conversations: mockConversations,
    selectedId,
    setSelectedId,
    selected,
    messages,
    search,
    setSearch,
    personaFilter,
    setPersonaFilter,
    filteredConversations,
    errorMessage: "Erro ao carregar conversas. Verifique sua conexão.",
  };
}