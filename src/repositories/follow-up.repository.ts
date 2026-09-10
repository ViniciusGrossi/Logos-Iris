// Logos Iris — Follow-ups (referência de uso do gate — feature-gating-v1, Requisito 3)
// Único ponto de acesso a iris.follow_ups. A spec própria de Follow-up (wave 2, persona-vendas.md)
// ainda não existe; este repository cobre só create(), o mínimo pra FollowUpService.scheduleFollowUp
// demonstrar "chama CheckFeatureGate antes de escrever no Repository".

import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import { FollowUpQueryError } from "@/services/feature-gating.errors";
import type { FollowUpDTO } from "@/types/follow-up.types";

interface FollowUpRow {
  id: string;
  conversation_id: string;
  agendado_para: string;
  status: string;
}

function toDTO(row: FollowUpRow): FollowUpDTO {
  return {
    id: row.id,
    conversation_id: row.conversation_id,
    agendado_para: row.agendado_para,
    status: row.status as FollowUpDTO["status"],
  };
}

export interface CreateFollowUpParams {
  tenantId: string;
  conversationId: string;
  agendadoPara: string;
}

export interface FollowUpRepository {
  create(params: CreateFollowUpParams): Promise<FollowUpDTO>;
}

export class SupabaseFollowUpRepository implements FollowUpRepository {
  constructor(private readonly db: IrisSupabaseClient) {}

  async create(params: CreateFollowUpParams): Promise<FollowUpDTO> {
    const { data, error } = await this.db
      .from("follow_ups")
      .insert({
        tenant_id: params.tenantId,
        conversation_id: params.conversationId,
        agendado_para: params.agendadoPara,
      })
      .select("*")
      .maybeSingle();

    if (error) throw new FollowUpQueryError(error.message);
    if (!data) throw new FollowUpQueryError("create: insert não retornou linha");
    return toDTO(data as FollowUpRow);
  }
}
