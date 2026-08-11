import type { IrisSupabaseClient } from "@/lib/supabase/service-client";

export interface MessageDebouncerRepository {
  /**
   * Atualiza (ou cria) o debounce_until de uma conversa para "agora + janela".
   * Idempotente: chamadas repetidas estendem o prazo.
   * tenantId é necessário porque conversation_state tem tenant_id denormalizado (RLS).
   */
  bufferMessage(params: { conversationId: string; tenantId: string; messageId: string }): Promise<{ debounceUntil: Date }>;

  /**
   * Varre conversation_state por registros com debounce_until vencido (≤ now()).
   * Retorna os conversation_id + message_ids acumulados desde o último flush.
   * O índice parcial `conversation_state_debounce_idx WHERE debounce_until IS NOT NULL`
   * garante que conversas sem pendência nunca entram na varredura (CA#5).
   */
  flushDue(): Promise<{ conversationId: string; messageIds: string[] }[]>;

  /**
   * Limpa o debounce_until de uma conversa após o flush (CA#4).
   * Seta debounce_until = null para que a conversa saia do índice parcial.
   */
  clearDebounce(conversationId: string): Promise<void>;
}

/** Tipo de retorno da RPC debouncer_flush_due (migration 0018). */
interface DebouncerFlushDueRow {
  conversation_id: string;
  message_ids: string[];
}

export class SupabaseMessageDebouncerRepository implements MessageDebouncerRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async bufferMessage(params: {
    conversationId: string;
    tenantId: string;
    messageId: string;
  }): Promise<{ debounceUntil: Date }> {
    const janelaSegundos = 8; // mesmo default de 0016
    const debounceUntil = new Date(Date.now() + janelaSegundos * 1000).toISOString();
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 1 dia

    const { data, error } = await this.db
      .from("conversation_state")
      .upsert(
        {
          conversation_id: params.conversationId,
          tenant_id: params.tenantId,
          debounce_until: debounceUntil,
          expires_at: expiresAt,
        },
        { onConflict: "conversation_id" }
      )
      .select("debounce_until")
      .single();

    if (error) throw new Error(`bufferMessage falhou: ${error.message}`);
    return { debounceUntil: new Date(data.debounce_until as string) };
  }

  async flushDue(): Promise<{ conversationId: string; messageIds: string[] }[]> {
    // RPC definida na migration 0018 — tipo não está em database.types.ts ainda
    // (gerado pelo Supabase CLI, que não cobre funções em schema customizado).
    // @ts-expect-error — "debouncer_flush_due" é RPC nova, será incluída nos tipos após
    // aplicar a migration 0018 e rodar `supabase gen types`. Mesmo padrão de outras
    // RPCs do projeto que entraram antes da regeneração de tipos (ex: router_worker_verify_token).
    const { data, error } = await this.db.rpc("debouncer_flush_due") as {
      data: DebouncerFlushDueRow[] | null;
      error: Error | null;
    };

    if (error) throw new Error(`flushDue falhou: ${error.message}`);
    if (!data) return [];

    return data.map((row: DebouncerFlushDueRow) => ({
      conversationId: row.conversation_id,
      messageIds: row.message_ids,
    }));
  }

  async clearDebounce(conversationId: string): Promise<void> {
    const { error } = await this.db
      .from("conversation_state")
      .update({ debounce_until: null })
      .eq("conversation_id", conversationId);

    if (error) throw new Error(`clearDebounce falhou: ${error.message}`);
  }
}