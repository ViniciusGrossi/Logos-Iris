import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

export interface EngineMessageRepository {
  /**
   * DESVIO documentado: leitura estreita em iris.messages (tabela listada em "Fora de Escopo/
   * Restrições Técnicas" como tocada a jusante). Só READ, nunca write — necessário pro próprio
   * critério de aceite desta spec (distinguir eco da engine de envio humano real, ADR-029).
   */
  wasEmittedByEngine(tenantId: string, providerMessageId: string): Promise<boolean>;
}

export class SupabaseEngineMessageRepository implements EngineMessageRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async wasEmittedByEngine(tenantId: string, providerMessageId: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("messages")
      .select("id")
      .eq("tenant_id", tenantId)
      .eq("provider_message_id", providerMessageId)
      .eq("direcao", "enviada")
      .limit(1);

    if (error) throw new Error(`messages lookup falhou: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }
}
