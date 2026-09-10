import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { HandoffPersistenceError } from "@/services/human-handoff.errors";
import type { ConversationRow, OpenHandoffEvent } from "@/types/human-handoff.types";

// Cópia local do union — specs/api.contracts.ts não é um módulo importável (documentação, sem `export`).
export type HandoffTrigger =
  | "botao_painel"
  | "from_me_detectado"
  | "comando_chat"
  | "pedido_cliente"
  | "baixa_confianca";

// ponytail: "N horas" (Requisito 4) não tem valor numérico definido em nenhum ADR/spec lido —
// default conservador documentado; ver SYNC REQUESTS no relatório final antes de fixar em produto.
export const DEFAULT_HANDOFF_PAUSE_HOURS = 2;

export interface HandoffRepository {
  /** Contato (por telefone) → conversa mais recente não encerrada. null se nenhuma existir (no-op gracioso). */
  findActiveConversationId(tenantId: string, customerPhone: string): Promise<string | null>;

  /** Espelha exatamente a assinatura de PauseConversation em specs/api.contracts.ts. */
  pauseForHandoff(params: {
    tenant_id: string;
    conversation_id: string;
    gatilho: HandoffTrigger;
    pausada_ate?: string;
  }): Promise<{ status: "pausada" }>;
}

/**
 * Superfície adicional exigida pelo human-handoff v1 (resume nunca silencioso + dossiê) — interface
 * SEPARADA de HandoffRepository de propósito: whatsapp-gateway e persona-atendimento fakeiam
 * HandoffRepository nos testes deles com só os 2 métodos acima; adicionar método novo lá quebraria
 * a compilação daqueles fakes. SupabaseHandoffRepository implementa as duas.
 */
export interface HumanHandoffRepository {
  /** Linha de iris.conversations filtrada por tenant_id. null = não existe / é de outro tenant. */
  getConversation(tenantId: string, conversationId: string): Promise<ConversationRow | null>;

  /** Grava a pausa (conversations.status + handoff_events). Reusa a mesma escrita de pauseForHandoff. */
  pauseForHandoff(params: {
    tenant_id: string;
    conversation_id: string;
    gatilho: HandoffTrigger;
    pausada_ate?: string;
  }): Promise<{ status: "pausada" }>;

  /** handoff_events mais recente da conversa com resolvido_em is null. null = nada aberto. */
  findOpenHandoffEvent(tenantId: string, conversationId: string): Promise<OpenHandoffEvent | null>;

  /** Total de handoff_events da conversa — linha 3 do dossiê ("N handoff(s) anteriores"). */
  countHandoffEvents(tenantId: string, conversationId: string): Promise<number>;

  /** Fecha o evento: resolvido_em=now(), retomada_confirmada=<arg>. Filtrado por tenant_id. */
  resolveHandoffEvent(tenantId: string, eventId: string, retomadaConfirmada: boolean): Promise<void>;

  /** conversations.status='ativa' + pausada_ate=null. Filtrado por tenant_id. */
  activateConversation(tenantId: string, conversationId: string): Promise<void>;
}

export class SupabaseHandoffRepository implements HandoffRepository, HumanHandoffRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async findActiveConversationId(tenantId: string, customerPhone: string): Promise<string | null> {
    // iris_private não é exposto via Data API (supabase/config.toml) — wrapper SECURITY DEFINER
    // em iris (migração 0015) encapsula o hash determinístico sem expor iris_private inteiro.
    const { data: contactId, error: contactError } = await this.db.rpc("gateway_find_contact_id", {
      p_tenant_id: tenantId,
      p_telefone: customerPhone,
    });
    if (contactError) throw new Error(`gateway_find_contact_id falhou: ${contactError.message}`);
    if (!contactId) return null;

    const { data, error } = await this.db
      .from("conversations")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("contact_id", contactId as string)
      .neq("status", "encerrada")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new Error(`conversations lookup falhou: ${error.message}`);
    return (data as { id: string } | null)?.id ?? null;
  }

  async pauseForHandoff(params: {
    tenant_id: string;
    conversation_id: string;
    gatilho: HandoffTrigger;
    pausada_ate?: string;
  }): Promise<{ status: "pausada" }> {
    const pausadaAte =
      params.pausada_ate ??
      new Date(Date.now() + DEFAULT_HANDOFF_PAUSE_HOURS * 60 * 60 * 1000).toISOString();

    const { error: updateError } = await this.db
      .from("conversations")
      .update({ status: "pausada", pausada_ate: pausadaAte, updated_at: new Date().toISOString() })
      .eq("id", params.conversation_id)
      .eq("tenant_id", params.tenant_id);
    if (updateError) throw new Error(`conversations pause falhou: ${updateError.message}`);

    const { error: insertError } = await this.db.from("handoff_events").insert({
      tenant_id: params.tenant_id,
      conversation_id: params.conversation_id,
      gatilho: params.gatilho,
      acionado_em: new Date().toISOString(),
    });
    if (insertError) throw new Error(`handoff_events insert falhou: ${insertError.message}`);

    return { status: "pausada" };
  }

  // ── HumanHandoffRepository (human-handoff v1) ──────────────────────────────

  async getConversation(tenantId: string, conversationId: string): Promise<ConversationRow | null> {
    const { data, error } = await this.db
      .from("conversations")
      .select("id, tenant_id, contact_id, persona_ativa, status, pausada_ate, created_at")
      .eq("tenant_id", tenantId)
      .eq("id", conversationId)
      .maybeSingle();

    if (error) throw new HandoffPersistenceError(`conversations lookup falhou: ${error.message}`);
    return (data as ConversationRow | null) ?? null;
  }

  async findOpenHandoffEvent(tenantId: string, conversationId: string): Promise<OpenHandoffEvent | null> {
    const { data, error } = await this.db
      .from("handoff_events")
      .select("id, gatilho, acionado_em")
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId)
      .is("resolvido_em", null)
      .order("acionado_em", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw new HandoffPersistenceError(`handoff_events (aberto) lookup falhou: ${error.message}`);
    return (data as OpenHandoffEvent | null) ?? null;
  }

  async countHandoffEvents(tenantId: string, conversationId: string): Promise<number> {
    const { count, error } = await this.db
      .from("handoff_events")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("conversation_id", conversationId);

    if (error) throw new HandoffPersistenceError(`handoff_events count falhou: ${error.message}`);
    return count ?? 0;
  }

  async resolveHandoffEvent(tenantId: string, eventId: string, retomadaConfirmada: boolean): Promise<void> {
    const { error } = await this.db
      .from("handoff_events")
      .update({ resolvido_em: new Date().toISOString(), retomada_confirmada: retomadaConfirmada })
      .eq("tenant_id", tenantId)
      .eq("id", eventId);

    if (error) throw new HandoffPersistenceError(`handoff_events resolve falhou: ${error.message}`);
  }

  async activateConversation(tenantId: string, conversationId: string): Promise<void> {
    const { error } = await this.db
      .from("conversations")
      .update({ status: "ativa", pausada_ate: null, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId)
      .eq("id", conversationId);

    if (error) throw new HandoffPersistenceError(`conversations activate falhou: ${error.message}`);
  }
}
