import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { WhatsAppConnectionRow } from "@/adapters/whatsapp/types";

export interface WhatsAppConnectionRepository {
  getByTenantId(tenantId: string): Promise<WhatsAppConnectionRow | null>;
  updateSessionStatus(
    tenantId: string,
    status: "conectado" | "desconectado" | "pareando"
  ): Promise<void>;
}

// whatsapp_connections — RLS ON sem policy (ADR-018). Só acessível via service_role.
export class SupabaseWhatsAppConnectionRepository implements WhatsAppConnectionRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async getByTenantId(tenantId: string): Promise<WhatsAppConnectionRow | null> {
    const { data, error } = await this.db
      .from("whatsapp_connections")
      .select("tenant_id, provider, instance_id, credentials_ref, session_status, updated_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();

    if (error) throw new Error(`whatsapp_connections lookup falhou: ${error.message}`);
    return data as WhatsAppConnectionRow | null;
  }

  async updateSessionStatus(
    tenantId: string,
    status: "conectado" | "desconectado" | "pareando"
  ): Promise<void> {
    const { error } = await this.db
      .from("whatsapp_connections")
      .update({ session_status: status, updated_at: new Date().toISOString() })
      .eq("tenant_id", tenantId);

    if (error) throw new Error(`whatsapp_connections update falhou: ${error.message}`);
  }
}
