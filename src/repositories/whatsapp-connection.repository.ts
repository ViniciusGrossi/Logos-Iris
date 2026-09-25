import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { WhatsAppConnectionRow } from "@/adapters/whatsapp/types";

export interface WhatsAppConnectionRepository {
  /**
   * `credentials_ref` no retorno é a coluna CRUA (referência ao Vault, ex.: 'vault:...') — nunca
   * o segredo em claro. Suficiente para status()/pareamento() (só precisam de instance_id/
   * session_status). Quem precisa mandar mensagem de verdade chama resolveCredentials() à parte
   * (ALTO-2, fix 0024) — mantém getByTenantId barato/sem side-effect de Vault pra todo caller que
   * não precisa da credencial.
   */
  getByTenantId(tenantId: string): Promise<WhatsAppConnectionRow | null>;
  /**
   * Resolve `credentials_ref` (referência) -> segredo real via Supabase Vault. Memoizado por
   * instância do Repository (achado do /code-review: um worker que processa N itens do MESMO
   * tenant no mesmo batch — ex. appointment-confirmation-worker — não deve chamar a RPC de Vault
   * N vezes). Cada invocação/request cria sua própria instância do Repository (createServiceClient/
   * createDenoServiceClient), então o cache nunca atravessa requests nem envelhece.
   */
  resolveCredentials(tenantId: string): Promise<string>;
  updateSessionStatus(
    tenantId: string,
    status: "conectado" | "desconectado" | "pareando"
  ): Promise<void>;
}

// whatsapp_connections — RLS ON sem policy (ADR-018). Só acessível via service_role.
export class SupabaseWhatsAppConnectionRepository implements WhatsAppConnectionRepository {
  private readonly credentialsCache = new Map<string, Promise<string>>();

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

  async resolveCredentials(tenantId: string): Promise<string> {
    const cached = this.credentialsCache.get(tenantId);
    if (cached) return cached;

    const promise = this.resolveCredentialsUncached(tenantId);
    // Guarda a Promise (não o valor) ANTES de await — chamadas concorrentes pro mesmo tenantId
    // (ex.: N appointments do mesmo tenant processados em paralelo) reusam a mesma requisição em
    // vez de disparar N RPCs de Vault em corrida.
    this.credentialsCache.set(tenantId, promise);
    // Falha nunca fica presa em cache — próxima chamada tenta resolver de novo.
    promise.catch(() => this.credentialsCache.delete(tenantId));
    return promise;
  }

  private async resolveCredentialsUncached(tenantId: string): Promise<string> {
    // ALTO-2 (fix 0024): `credentials_ref` na tabela é só uma REFERÊNCIA ao Supabase Vault
    // ('vault:...'), nunca o segredo em claro. Resolvido só aqui, sob demanda — quem chama isto
    // é send()/pareamento() dos 3 adapters (os únicos que de fato usam a credencial), nunca
    // status() (defesa em profundidade: checar status de conexão nunca deveria depender do Vault
    // estar populado).
    // @ts-expect-error — "resolve_whatsapp_credentials" é RPC nova (migração 0024), ainda não está
    // em database.types.ts (mesmo padrão de outras RPCs recentes, ver memory_get_latest_summary).
    const { data: resolved, error } = (await this.db.rpc("resolve_whatsapp_credentials", {
      p_tenant_id: tenantId,
    })) as { data: string | null; error: { message: string } | null };

    if (error) throw new Error(`resolve_whatsapp_credentials falhou: ${error.message}`);
    if (resolved === null) {
      throw new Error(
        `whatsapp_connections.credentials_ref ausente pro tenant ${tenantId} — conexão configurada sem referência de credencial`
      );
    }
    return resolved;
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
