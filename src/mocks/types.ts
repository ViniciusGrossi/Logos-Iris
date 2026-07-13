export type Persona = "atendimento" | "vendas" | "agendamento" | "sdr";

export const PERSONA_LABEL: Record<Persona, string> = {
  atendimento: "Atendimento",
  vendas: "Vendas",
  agendamento: "Agendamento",
  sdr: "SDR",
};

export type ConversationStatus = "ativa" | "pausada" | "encerrada";

export interface Conversation {
  id: string;
  contactName: string;
  contactInitial: string;
  lastMessagePreview: string;
  lastMessageAt: string;
  persona: Persona;
  status: ConversationStatus;
  unread: boolean;
}

export type MessageDirection = "recebida" | "enviada";

export interface Message {
  id: string;
  direction: MessageDirection;
  content: string;
  sentAt: string;
}

export type SignalType = "orcamento" | "lead_quente" | "agendamento" | "fora_catalogo";

export interface DailySignal {
  id: string;
  type: SignalType;
  persona: Persona;
  description: string;
  conversationId: string;
  time: string;
}

export type TenantStatus = "ativo" | "pausado" | "cancelado";

export interface Tenant {
  id: string;
  nome: string;
  plano: string;
  status: TenantStatus;
  conversasNoMes: number;
  limiteConversas: number;
}
