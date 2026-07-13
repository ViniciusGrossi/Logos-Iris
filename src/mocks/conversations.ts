import type { Conversation, Message } from "./types";

export const conversations: Conversation[] = [
  {
    id: "c1",
    contactName: "Marcelo Andrade",
    contactInitial: "M",
    lastMessagePreview: "Fecho o pacote de 6 sessões então, pode gerar o link?",
    lastMessageAt: "09:42",
    persona: "vendas",
    status: "ativa",
    unread: true,
  },
  {
    id: "c2",
    contactName: "Juliana Ferraz",
    contactInitial: "J",
    lastMessagePreview: "Perfeito, confirmado pra quinta às 15h",
    lastMessageAt: "09:15",
    persona: "agendamento",
    status: "ativa",
    unread: false,
  },
  {
    id: "c3",
    contactName: "Espaço Vitta (fornecedor)",
    contactInitial: "E",
    lastMessagePreview: "Vocês fazem entrega pra fora de SP?",
    lastMessageAt: "08:58",
    persona: "atendimento",
    status: "ativa",
    unread: true,
  },
  {
    id: "c4",
    contactName: "Ricardo Sales",
    contactInitial: "R",
    lastMessagePreview: "Vi o anúncio de vocês, queria saber mais",
    lastMessageAt: "08:30",
    persona: "sdr",
    status: "pausada",
    unread: false,
  },
  {
    id: "c5",
    contactName: "Fernanda Lima",
    contactInitial: "F",
    lastMessagePreview: "Obrigada! Até semana que vem",
    lastMessageAt: "ontem",
    persona: "agendamento",
    status: "encerrada",
    unread: false,
  },
];

export const messagesByConversation: Record<string, Message[]> = {
  c1: [
    { id: "m1", direction: "recebida", content: "Oi, vi que vocês têm pacote de sessões. Quanto fica o de 6?", sentAt: "09:20" },
    { id: "m2", direction: "enviada", content: "Oi Marcelo! O pacote de 6 sessões sai por R$ 780 (R$ 130/sessão) — 13% mais barato que avulso. Quer que eu já gere o link de pagamento?", sentAt: "09:25" },
    { id: "m3", direction: "recebida", content: "Fecho o pacote de 6 sessões então, pode gerar o link?", sentAt: "09:42" },
  ],
};
