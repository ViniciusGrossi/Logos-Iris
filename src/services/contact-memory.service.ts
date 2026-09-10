// Logos Iris — contact-memory (docs/specs/contact-memory.md)
// Geração de memória de contato: cobre o lado OPOSTO ao já implementado por persona-atendimento
// (src/repositories/contact-memory.repository.ts::findLatestValidSummary, leitura). Esta spec
// cobre onde/quando o resumo é PERSISTIDO — nunca a heurística/modelo de sumarização em si (Fora
// de Escopo da spec: "qual prompt, qual modelo" pertence à spec própria do ModelGateway).
// Expiração (job diário de purge) e cascata de esquecimento (contacts.deleted_at) são 100% SQL
// (pg_cron + trigger, migração 0022) — nada aqui, não têm superfície de TS para testar via Fake
// (mesmo padrão de iris_private.ensure_next_partitions em 0013, sem contraparte em src/services).

import {
  summarizeContactMemoryParamsSchema,
  type SummarizeContactMemoryParams,
} from "@/schemas/contact-memory.schema";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import { NoMessagesInPeriodError } from "@/services/contact-memory.errors";
import type { ContactMemorySummaryDTO, RawContactMessage } from "@/types/contact-memory.types";

/**
 * Porta injetada para a síntese do resumo em si — deliberadamente SEM implementação concreta
 * nesta spec (Fora de Escopo: "Heurística/modelo de sumarização em si... usa ModelGateway já
 * especificado em outra spec"). O worker (Edge Function, supabase/functions/
 * contact-memory-summarizer-worker) injeta a implementação real quando a spec do ModelGateway
 * tiver um client de invocação de LLM (hoje só tem routeModel — escolha do modelo, nenhuma
 * chamada de completion real em lugar nenhum do codebase). Mesmo espírito do TODO deixado em
 * debouncer-flush-worker/index.ts para a integração com o Engine.
 */
export interface ContactMemorySummaryGenerator {
  generate(params: { tenant_id: string; mensagens: RawContactMessage[] }): Promise<string>;
}

export interface ContactMemoryServiceDeps {
  contactMemoryRepo: ContactMemoryRepository;
  summaryGenerator: ContactMemorySummaryGenerator;
}

export class ContactMemoryService {
  constructor(private readonly deps: ContactMemoryServiceDeps) {}

  /**
   * SummarizeContactMemory (API Contract da spec) — Requisitos 1, 2 e 6:
   * 1. Busca as mensagens brutas do período (só nesta função, nunca persistidas como estão).
   * 2. Delega a síntese ao generator injetado (fora de escopo desta spec).
   * 3. Persiste só o resumo sintetizado via repo.insertSummary — expira_em é derivado de
   *    plans.retencao_memoria_dias DENTRO do RPC (iris.memory_create_summary, migração 0022),
   *    nunca calculado aqui, então o "no momento da criação" do Requisito 2 é atômico com o insert.
   */
  async summarizeContactMemory(params: SummarizeContactMemoryParams): Promise<ContactMemorySummaryDTO> {
    const { tenant_id, contact_id, periodo_inicio, periodo_fim } =
      summarizeContactMemoryParamsSchema.parse(params);

    const mensagens = await this.deps.contactMemoryRepo.findMessagesForPeriod(
      tenant_id,
      contact_id,
      periodo_inicio,
      periodo_fim,
    );
    if (mensagens.length === 0) {
      throw new NoMessagesInPeriodError(contact_id);
    }

    // Requisito 6: `mensagens` (texto bruto do cliente final) só existe na pilha deste método —
    // entra no generator (transiente) e nunca cruza a fronteira de persistência. Só `resumo`
    // (a síntese que sai do generator) é passado ao repository.
    const resumo = await this.deps.summaryGenerator.generate({ tenant_id, mensagens });

    return this.deps.contactMemoryRepo.insertSummary({
      tenant_id,
      contact_id,
      resumo,
      periodo_inicio,
      periodo_fim,
    });
  }
}
