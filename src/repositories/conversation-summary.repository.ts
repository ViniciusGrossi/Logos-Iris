import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { InboxQueryError } from "@/services/inbox.errors";
import type { ConversationSummary, MessageDTO } from "@/types/conversation-summary.types";

interface ConversationsListRow {
  id: string;
  contact_nome: string | null;
  contact_telefone: string;
  persona_ativa: string;
  status: string;
  pausada_ate: string | null;
  ultima_mensagem_preview: string | null;
  ultima_mensagem_em: string | null;
  total: number;
}

interface MessagesListRow {
  id: string;
  direcao: string;
  conteudo: string;
  tipo_midia: string;
  created_at: string;
  total: number;
}

export interface ConversationSummaryRepository {
  listByTenant(params: {
    tenantId: string;
    status?: string;
    persona?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ConversationSummary[]; total: number }>;

  listMessages(params: {
    tenantId: string;
    conversationId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: MessageDTO[]; total: number }>;
}

export class SupabaseConversationSummaryRepository implements ConversationSummaryRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async listByTenant(params: {
    tenantId: string;
    status?: string;
    persona?: string;
    limit: number;
    offset: number;
  }): Promise<{ items: ConversationSummary[]; total: number }> {
    // @ts-expect-error — "conversations_list" é RPC nova (migração 0026), ainda não está em
    // database.types.ts (mesmo padrão de outras RPCs recentes, ver memory_get_latest_summary).
    const { data, error } = (await this.db.rpc("conversations_list", {
      p_tenant_id: params.tenantId,
      p_status: params.status ?? null,
      p_persona: params.persona ?? null,
      p_limit: params.limit,
      p_offset: params.offset,
    })) as { data: ConversationsListRow[] | null; error: { message: string } | null };

    if (error) throw new InboxQueryError(error.message);
    const rows = data ?? [];

    return {
      items: rows.map((row) => ({
        id: row.id,
        contact_nome: row.contact_nome,
        contact_telefone: row.contact_telefone,
        persona_ativa: row.persona_ativa as ConversationSummary["persona_ativa"],
        status: row.status as ConversationSummary["status"],
        pausada_ate: row.pausada_ate,
        ultima_mensagem_preview: row.ultima_mensagem_preview ?? "",
        ultima_mensagem_em: row.ultima_mensagem_em ?? "",
      })),
      total: rows[0]?.total ?? 0,
    };
  }

  async listMessages(params: {
    tenantId: string;
    conversationId: string;
    limit: number;
    offset: number;
  }): Promise<{ items: MessageDTO[]; total: number }> {
    // @ts-expect-error — "conversation_messages_list" é RPC nova (migração 0026).
    const { data, error } = (await this.db.rpc("conversation_messages_list", {
      p_tenant_id: params.tenantId,
      p_conversation_id: params.conversationId,
      p_limit: params.limit,
      p_offset: params.offset,
    })) as { data: MessagesListRow[] | null; error: { message: string } | null };

    if (error) throw new InboxQueryError(error.message);
    const rows = data ?? [];

    return {
      items: rows.map((row) => ({
        id: row.id,
        direcao: row.direcao as MessageDTO["direcao"],
        conteudo: row.conteudo,
        tipo_midia: row.tipo_midia as MessageDTO["tipo_midia"],
        created_at: row.created_at,
      })),
      total: rows[0]?.total ?? 0,
    };
  }
}
