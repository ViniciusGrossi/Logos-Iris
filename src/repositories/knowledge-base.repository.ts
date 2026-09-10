// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Único ponto de acesso a iris.knowledge_base_entries. Sempre retorna KnowledgeEntryDTO, nunca a
// row bruta. Tabela é tenant-scoped com RLS (migração 0008) — toda query aqui filtra por
// tenant_id explicitamente (defesa em profundidade, mesmo padrão de handoff.repository.ts /
// tenant-lookup.repository.ts: client injetado é service-role, então o filtro no WHERE é quem
// garante isolamento de tenant no caminho de app, RLS cobre o caminho direto ao Postgres).

import type { Json } from "@/lib/supabase/database.types";
import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { KnowledgeEntryQueryError } from "@/services/knowledge-base.errors";
import type { EntryStatus, KnowledgeField, KnowledgeEntryDTO } from "@/types/knowledge-base.types";

// jsonb genérico: Record<string, unknown> (nosso DTO/contrato) não é estruturalmente igual a Json
// (tipo gerado, recursivo e sem `unknown`) — cast pontual na fronteira de escrita/leitura do driver.
function toJson(conteudo: Record<string, unknown>): Json {
  return conteudo as unknown as Json;
}

function fromJson(json: Json): Record<string, unknown> {
  return json as unknown as Record<string, unknown>;
}

// GLOBAL-RULES: "Paginação obrigatória em listagens — nunca retornar coleções sem limite".
// GetKnowledgeBase (contrato) não tem page/limit — mudar a assinatura é Sync Request (fora de
// escopo). Cap interno pragmático: 7 campos x poucas versões cobre o uso real por muito tempo;
// documentado em DESVIOS do report, não é um limite "real" de paginação.
const MAX_ROWS = 200;

export interface UpsertDraftParams {
  tenantId: string;
  campo: KnowledgeField;
  versao: number;
  conteudo: Record<string, unknown>;
  contradicaoDetectada: boolean;
}

export interface KnowledgeEntryRepository {
  /** GET /api/knowledge-base?campo= — todas as entries (rascunho/publicado/histórico) do tenant. */
  findByTenant(tenantId: string, campo?: KnowledgeField): Promise<KnowledgeEntryDTO[]>;
  /**
   * Atualiza o rascunho aberto do campo (se existir, mesmo tenant+campo+status='rascunho') ou
   * insere um novo. Nunca cria 2 rascunhos para o mesmo campo simultaneamente.
   */
  upsertDraft(params: UpsertDraftParams): Promise<KnowledgeEntryDTO>;
  /**
   * Transição de status (publish/rollback). `tenantId` é redundante com o `id` (que já deve ter
   * sido resolvido dentro do tenant certo, via findByTenant) — defesa em profundidade: mesmo padrão
   * de `upsertDraft`, nunca confiar só no `id` pra isolamento de tenant.
   */
  setStatus(id: string, tenantId: string, status: EntryStatus, publicadoEm?: string | null): Promise<KnowledgeEntryDTO>;
}

interface KnowledgeEntryRow {
  id: string;
  tenant_id: string;
  campo: string;
  conteudo: Json;
  status: string;
  versao: number;
  contradicao_detectada: boolean;
}

const TABLE = "knowledge_base_entries";

function toDTO(row: KnowledgeEntryRow): KnowledgeEntryDTO {
  return {
    id: row.id,
    campo: row.campo as KnowledgeField,
    conteudo: fromJson(row.conteudo),
    status: row.status as EntryStatus,
    versao: row.versao,
    contradicao_detectada: row.contradicao_detectada,
  };
}

export class SupabaseKnowledgeEntryRepository implements KnowledgeEntryRepository {
  // client já vem com schema "iris" fixado (ver src/lib/supabase/service-client.ts).
  constructor(private readonly db: IrisSupabaseClient) {}

  async findByTenant(tenantId: string, campo?: KnowledgeField): Promise<KnowledgeEntryDTO[]> {
    let query = this.db.from(TABLE).select("*").eq("tenant_id", tenantId);
    if (campo) query = query.eq("campo", campo);

    const { data, error } = await query
      .order("campo", { ascending: true })
      .order("versao", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw new KnowledgeEntryQueryError(error.message);
    return (data ?? []).map((row) => toDTO(row as KnowledgeEntryRow));
  }

  async upsertDraft(params: UpsertDraftParams): Promise<KnowledgeEntryDTO> {
    const { data: existing, error: findError } = await this.db
      .from(TABLE)
      .select("*")
      .eq("tenant_id", params.tenantId)
      .eq("campo", params.campo)
      .eq("status", "rascunho")
      .maybeSingle();

    if (findError) throw new KnowledgeEntryQueryError(findError.message);

    if (existing) {
      const { data, error } = await this.db
        .from(TABLE)
        .update({
          conteudo: toJson(params.conteudo),
          contradicao_detectada: params.contradicaoDetectada,
          updated_at: new Date().toISOString(),
        })
        .eq("id", (existing as KnowledgeEntryRow).id)
        .eq("tenant_id", params.tenantId)
        .select("*")
        .maybeSingle();

      if (error) throw new KnowledgeEntryQueryError(error.message);
      if (!data) throw new KnowledgeEntryQueryError("upsertDraft: update não retornou linha");
      return toDTO(data as KnowledgeEntryRow);
    }

    const { data, error } = await this.db
      .from(TABLE)
      .insert({
        tenant_id: params.tenantId,
        campo: params.campo,
        conteudo: toJson(params.conteudo),
        status: "rascunho",
        versao: params.versao,
        contradicao_detectada: params.contradicaoDetectada,
      })
      .select("*")
      .maybeSingle();

    if (error) throw new KnowledgeEntryQueryError(error.message);
    if (!data) throw new KnowledgeEntryQueryError("upsertDraft: insert não retornou linha");
    return toDTO(data as KnowledgeEntryRow);
  }

  async setStatus(
    id: string,
    tenantId: string,
    status: EntryStatus,
    publicadoEm?: string | null,
  ): Promise<KnowledgeEntryDTO> {
    const patch: { status: EntryStatus; updated_at: string; publicado_em?: string } = {
      status,
      updated_at: new Date().toISOString(),
    };
    if (status === "publicado") {
      patch.publicado_em = publicadoEm ?? new Date().toISOString();
    }

    const { data, error } = await this.db
      .from(TABLE)
      .update(patch)
      .eq("id", id)
      .eq("tenant_id", tenantId)
      .select("*")
      .maybeSingle();

    if (error) throw new KnowledgeEntryQueryError(error.message);
    if (!data) throw new KnowledgeEntryQueryError(`setStatus: entry id="${id}" não encontrada`);
    return toDTO(data as KnowledgeEntryRow);
  }
}
