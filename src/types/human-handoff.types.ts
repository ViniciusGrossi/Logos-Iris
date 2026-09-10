// Logos Iris — human-handoff (docs/specs/human-handoff.md)
// DTOs do domínio Handoff. `HandoffTrigger`/`ConversationStatus` copiados de specs/api.contracts.ts
// (não é módulo importável — documentação sem `export`), idênticos ao CHECK de iris.handoff_events
// e iris.conversations (migração 0005).

export type HandoffTrigger =
  | "botao_painel"
  | "from_me_detectado"
  | "comando_chat"
  | "pedido_cliente"
  | "baixa_confianca";

export type ConversationStatus = "ativa" | "pausada" | "encerrada";

/** Espelha HandoffEventDTO de specs/api.contracts.ts — leitura interna do Service (dossiê + histórico). */
export interface HandoffEventDTO {
  id: string;
  conversation_id: string;
  gatilho: HandoffTrigger;
  acionado_em: string;
  resolvido_em: string | null;
  retomada_confirmada: boolean;
}

/** Linha de iris.conversations necessária para decidir "pausa longa" e montar o dossiê. */
export interface ConversationRow {
  id: string;
  tenant_id: string;
  contact_id: string;
  persona_ativa: "atendimento" | "vendas" | "agendamento" | "sdr";
  status: ConversationStatus;
  pausada_ate: string | null;
  created_at: string;
}

/** Evento de handoff ainda aberto (resolvido_em is null) — insumo do cálculo de pausa longa. */
export interface OpenHandoffEvent {
  id: string;
  gatilho: HandoffTrigger;
  acionado_em: string;
}

export type PauseResult = { status: "pausada" };
export type ResumeResult = { status: "ativa" } | { status: "aguardando_confirmacao" };

/**
 * Requisito 4 / Story 24 — dossiê curto (exatamente 3 linhas) entregue ao humano que assume a
 * conversa via `pedido_cliente`. Derivado só de fontes já cifradas (contact_memory) + metadados
 * estruturais da conversa; nunca reexpõe transcrição bruta (Segurança/LGPD da spec).
 */
export interface HandoffDossie {
  linhas: [string, string, string];
}
