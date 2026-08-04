import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

export interface TenantLookupRepository {
  /**
   * DESVIO documentado: lookup estreito e stateless por número de WhatsApp, distinto do
   * TenantRouterService completo (módulo 2, tenant-router-queue.md — que tem semântica própria
   * de locking/fila). Necessário aqui só porque webhook_inbox exige tenant_id ANTES do enqueue
   * (Requisito 3), e o Router só roda depois de já estar na fila.
   */
  findTenantIdByWhatsAppNumber(whatsappNumber: string): Promise<string | null>;
}

// iris.tenants.whatsapp_number é plaintext (índice btree único comum — confirmado em 0002).
export class SupabaseTenantLookupRepository implements TenantLookupRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async findTenantIdByWhatsAppNumber(whatsappNumber: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("tenants")
      .select("id")
      .eq("whatsapp_number", whatsappNumber)
      .maybeSingle();

    if (error) throw new Error(`tenants lookup falhou: ${error.message}`);
    return (data as { id: string } | null)?.id ?? null;
  }
}
