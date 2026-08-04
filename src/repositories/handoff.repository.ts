import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

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

export class SupabaseHandoffRepository implements HandoffRepository {
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
}
