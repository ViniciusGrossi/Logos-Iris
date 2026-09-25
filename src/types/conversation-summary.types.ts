// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Copiado 1:1 de specs/api.contracts.ts (ConversationSummary/MessageDTO).

export type Persona = "atendimento" | "vendas" | "agendamento" | "sdr";
export type ConversationStatus = "ativa" | "pausada" | "encerrada";

export interface ConversationSummary {
  id: string;
  contact_nome: string | null;
  contact_telefone: string;
  persona_ativa: Persona;
  status: ConversationStatus;
  pausada_ate: string | null;
  ultima_mensagem_preview: string;
  ultima_mensagem_em: string;
}

export interface PaginatedConversations {
  items: ConversationSummary[];
  total: number;
  page: number;
  limit: number;
}

export interface MessageDTO {
  id: string;
  direcao: "recebida" | "enviada";
  conteudo: string;
  tipo_midia: "texto" | "audio" | "imagem" | "documento";
  created_at: string;
}

export interface PaginatedMessages {
  items: MessageDTO[];
  total: number;
}
