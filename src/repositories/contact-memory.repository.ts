import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { ContactMemorySummaryDTO, RawContactMessage } from "@/types/contact-memory.types";

export interface ContactMemoryRepository {
  /**
   * Resumo mais recente e NÃO expirado (`expira_em > now()`) do contato — Story 2 da spec
   * persona-atendimento. null quando não há nenhum resumo válido (cliente novo OU só resumos
   * expirados, LGPD/ADR-026) — ambos os casos são no-op gracioso, nunca lançam.
   * Sempre filtrado por tenant_id + contact_id (defesa em profundidade, nunca cruza tenant).
   */
  findLatestValidSummary(tenantId: string, contactId: string): Promise<ContactMemorySummaryDTO | null>;

  /**
   * docs/specs/contact-memory.md — Requisito 1/6: mensagens brutas (já decriptadas) do contato no
   * período informado, ordenadas cronologicamente. Uso TRANSIENTE só pelo ContactMemoryService
   * (nunca persistidas de volta) — o Service passa o retorno pro generator e descarta. Sempre
   * filtrado por tenant_id + contact_id (defesa em profundidade, nunca cruza tenant).
   */
  findMessagesForPeriod(
    tenantId: string,
    contactId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<RawContactMessage[]>;

  /**
   * docs/specs/contact-memory.md — Requisito 1/2: persiste o resumo já sintetizado (nunca texto
   * bruto). `expira_em` é derivado de `plans.retencao_memoria_dias` do tenant DENTRO do RPC
   * (iris.memory_create_summary, migração 0022) — atômico com o insert, nunca calculado client-side.
   */
  insertSummary(params: {
    tenant_id: string;
    contact_id: string;
    resumo: string;
    periodo_inicio: string;
    periodo_fim: string;
  }): Promise<ContactMemorySummaryDTO>;
}

/** Tipo de retorno da RPC memory_get_latest_summary (migration 0020). */
interface MemoryGetLatestSummaryRow {
  id: string;
  contact_id: string;
  tenant_id: string;
  resumo: string;
  periodo_inicio: string;
  periodo_fim: string;
  expira_em: string;
  created_at: string;
}

export class SupabaseContactMemoryRepository implements ContactMemoryRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async findLatestValidSummary(tenantId: string, contactId: string): Promise<ContactMemorySummaryDTO | null> {
    // resumo_enc nunca decripta client-side — wrapper SECURITY DEFINER em iris (migração 0020)
    // encapsula iris_private.decrypt_pii + o filtro expira_em > now() sem expor iris_private
    // inteiro nem o bytea cru (mesmo padrão de iris.gateway_find_contact_id, migração 0015).
    // @ts-expect-error — "memory_get_latest_summary" é RPC nova, ainda não está em
    // database.types.ts (gerado pelo Supabase CLI, que só cobre o que já foi aplicado e
    // regenerado). Mesmo padrão de debouncer_flush_due em message-debouncer.repository.ts.
    const { data, error } = (await this.db.rpc("memory_get_latest_summary", {
      p_tenant_id: tenantId,
      p_contact_id: contactId,
    })) as { data: MemoryGetLatestSummaryRow[] | null; error: { message: string } | null };

    if (error) throw new Error(`memory_get_latest_summary falhou: ${error.message}`);
    if (!data || data.length === 0) return null;

    const row = data[0];
    return {
      id: row.id,
      contact_id: row.contact_id,
      tenant_id: row.tenant_id,
      resumo: row.resumo,
      periodo_inicio: row.periodo_inicio,
      periodo_fim: row.periodo_fim,
      expira_em: row.expira_em,
      created_at: row.created_at,
    };
  }

  async findMessagesForPeriod(
    tenantId: string,
    contactId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<RawContactMessage[]> {
    // iris.messages.conteudo_enc nunca decripta client-side — wrapper SECURITY DEFINER em iris
    // (migração 0022) decripta + filtra por (tenant_id, contact_id via join conversations,
    // periodo_inicio, periodo_fim) sem expor iris_private nem messages.conteudo_enc cru.
    // @ts-expect-error — "memory_fetch_messages_for_period" é RPC nova, ainda não está em
    // database.types.ts (mesmo padrão de memory_get_latest_summary acima).
    const { data, error } = (await this.db.rpc("memory_fetch_messages_for_period", {
      p_tenant_id: tenantId,
      p_contact_id: contactId,
      p_periodo_inicio: periodoInicio,
      p_periodo_fim: periodoFim,
    })) as { data: { conteudo: string; direcao: "recebida" | "enviada" }[] | null; error: { message: string } | null };

    if (error) throw new Error(`memory_fetch_messages_for_period falhou: ${error.message}`);
    if (!data) return [];

    return data.map((row) => ({ conteudo: row.conteudo, direcao: row.direcao }));
  }

  async insertSummary(params: {
    tenant_id: string;
    contact_id: string;
    resumo: string;
    periodo_inicio: string;
    periodo_fim: string;
  }): Promise<ContactMemorySummaryDTO> {
    // iris_private.encrypt_pii nunca é chamado client-side — wrapper SECURITY DEFINER em iris
    // (migração 0022) encripta + deriva expira_em de plans.retencao_memoria_dias + insere,
    // tudo atômico dentro do RPC (Requisito 2 — "no momento da criação do resumo").
    // @ts-expect-error — "memory_create_summary" é RPC nova, ainda não está em database.types.ts.
    const { data, error } = (await this.db.rpc("memory_create_summary", {
      p_tenant_id: params.tenant_id,
      p_contact_id: params.contact_id,
      p_resumo: params.resumo,
      p_periodo_inicio: params.periodo_inicio,
      p_periodo_fim: params.periodo_fim,
    })) as { data: MemoryGetLatestSummaryRow[] | null; error: { message: string } | null };

    if (error) throw new Error(`memory_create_summary falhou: ${error.message}`);
    if (!data || data.length === 0) {
      throw new Error("memory_create_summary não retornou nenhuma linha após o insert");
    }

    const row = data[0];
    return {
      id: row.id,
      contact_id: row.contact_id,
      tenant_id: row.tenant_id,
      resumo: row.resumo,
      periodo_inicio: row.periodo_inicio,
      periodo_fim: row.periodo_fim,
      expira_em: row.expira_em,
      created_at: row.created_at,
    };
  }
}
