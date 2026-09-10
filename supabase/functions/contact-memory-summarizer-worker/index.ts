// Logos Iris — contact-memory-summarizer-worker (docs/specs/contact-memory.md)
// Consumidor da fila pgmq `contact_memory_summarize`. SEM endpoint HTTP público de verdade:
// acionado 1x/minuto por pg_cron + pg_net (supabase/migrations/0022_contact_memory_generation_
// purge_cascade.sql §7), roda como service_role no runtime Deno das Edge Functions (ADR-031),
// reusando o MESMO token dedicado do tenant-router-worker (0017/0019 já estabeleceram esse reuso
// entre workers distintos em vez de criar um secret novo por worker).
//
// Arquitetura: importa e chama o ContactMemoryService de verdade (src/services/
// contact-memory.service.ts) — o MESMO arquivo-fonte coberto pelos testes vitest — via import map
// (deno.json). Nenhuma lógica de negócio de geração/persistência é reimplementada aqui.
//
// A única peça que NÃO está pronta em lugar nenhum do codebase é a síntese do resumo em si —
// Fora de Escopo desta spec ("Heurística/modelo de sumarização... usa ModelGateway já
// especificado, você só chama, não implementa lógica de prompt"). ModelGatewayService.routeModel
// só ESCOLHE o modelo (nenhum client de completion real existe ainda em nenhum módulo — nem
// ConversationEngineService chama LLM de verdade nesta v1). Este worker prova o "só chama" (rota
// o modelo antes de tentar sintetizar) e then falha de forma TIPADA e não-destrutiva: a mensagem
// fica na fila para reprocesso quando a capability real existir — nunca grava resumo
// fabricado/heurístico em resumo_enc (violaria o Requisito 6). Mesmo espírito do TODO deixado em
// debouncer-flush-worker/index.ts para a integração com o Engine.
//
// Segurança: nenhum dado de contato/conteúdo em log — só ids técnicos e contadores (LGPD).

import { ZodError } from "zod";

import { ContactMemoryService, type ContactMemorySummaryGenerator } from "@/services/contact-memory.service";
import { NoMessagesInPeriodError, SummaryGenerationNotImplementedError } from "@/services/contact-memory.errors";
import { SupabaseContactMemoryRepository } from "@/repositories/contact-memory.repository";
import { ModelGatewayService } from "@/services/model-gateway.service";
import { SupabaseModelRegistryRepository } from "@/repositories/model-registry.repository";
import { createDenoServiceClient, createDenoGenericServiceClient } from "../tenant-router-worker/deno-client.ts";

const BATCH_SIZE = 20; // ponytail: lote fixo, mesmo default de tenant-router-worker/debouncer-flush-worker

type QueueRow = { msg_id: number; message: Record<string, unknown> };

/**
 * ModelGatewaySummaryGenerator — chama ModelGateway.routeModel (cumprindo "você só chama" da
 * spec) para provar a integração, mas NÃO tem client de invocação de LLM real disponível em
 * nenhum lugar do codebase ainda (ver comentário de topo do arquivo). Lança
 * SummaryGenerationNotImplementedError de propósito — nunca inventa/heuristicamente concatena um
 * "resumo" a partir das mensagens brutas (isso violaria Requisito 6 e Fora de Escopo da spec).
 */
class ModelGatewaySummaryGenerator implements ContactMemorySummaryGenerator {
  constructor(private readonly modelGateway: ModelGatewayService) {}

  async generate(params: { tenant_id: string }): Promise<string> {
    // task_type 'conversa_principal' e tier_do_plano 'basico' como stopgap: model_registry (0004)
    // não tem um task_type dedicado a sumarização ainda (a própria spec, seção "Tokens e APIs
    // Externas", já deixa em aberto "task_type: conversa_principal ou dedicado a sumarização"),
    // e este generator não tem acesso ao tier real do plano do tenant (routeModel exige, mas
    // ContactMemorySummaryGenerator não injeta um lookup de plano) — SYNC REQUESTs no report.
    await this.modelGateway.routeModel({
      tenant_id: params.tenant_id,
      task_type: "conversa_principal",
      tier_do_plano: "basico",
    });
    throw new SummaryGenerationNotImplementedError();
  }
}

Deno.serve(async (req: Request) => {
  const db = createDenoServiceClient();

  // Autenticação: só o pg_cron (via pg_net, migração 0022) deve invocar este worker — não é
  // endpoint de usuário. Mesmo token dedicado de 0017/0019 (nunca sai do Postgres).
  const providedToken = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: isAuthorized, error: authError } = await db.rpc("router_worker_verify_token", {
    p_token: providedToken,
  });
  if (authError || !isAuthorized) {
    return Response.json({ ok: false, stage: "auth" }, { status: 401 });
  }

  const contactMemoryService = new ContactMemoryService({
    contactMemoryRepo: new SupabaseContactMemoryRepository(db),
    // SupabaseModelRegistryRepository faz .schema("iris") por-query — precisa de um client SEM
    // schema pinado na criação (mesmo padrão de getServiceRoleClient() no lado Next), por isso
    // um segundo client aqui em vez de reusar `db` (pinado em "iris", ver deno-client.ts).
    summaryGenerator: new ModelGatewaySummaryGenerator(
      new ModelGatewayService(new SupabaseModelRegistryRepository(createDenoGenericServiceClient())),
    ),
  });

  // @ts-expect-error — "memory_consume_summarize_queue" é RPC nova (migração 0022), ainda não
  // está em database.types.ts (mesmo padrão de contact-memory.repository.ts).
  const { data: batch, error: consumeError } = await db.rpc("memory_consume_summarize_queue", {
    p_max: BATCH_SIZE,
  });
  if (consumeError) {
    return Response.json({ ok: false, stage: "consume", error: consumeError.message }, { status: 500 });
  }

  const rows = (batch ?? []) as QueueRow[];
  let resumidas = 0,
    descartadas = 0,
    aguardandoCapability = 0,
    falhas = 0;

  for (const row of rows) {
    try {
      await contactMemoryService.summarizeContactMemory({
        tenant_id: row.message.tenant_id as string,
        contact_id: row.message.contact_id as string,
        periodo_inicio: row.message.periodo_inicio as string,
        periodo_fim: row.message.periodo_fim as string,
      });

      resumidas++;
      // @ts-expect-error — RPC nova (migração 0022), ainda não está em database.types.ts.
      await db.rpc("memory_delete_summarize_queue_item", { p_msg_id: row.msg_id });
    } catch (err) {
      falhas++;

      if (err instanceof ZodError || err instanceof NoMessagesInPeriodError) {
        // Poison-pill (payload malformado) OU terminal-sem-mudança (mesmo período nunca vai ter
        // mensagem nova): reprocessar não muda o resultado. Deletar agora — mesmo raciocínio do
        // achado de poison-pill/starvation do spec-reviewer em 2026-08-07 (tenant-router-worker):
        // sem isso, o item reapareceria a cada vt (60s) pra sempre e poderia saturar o lote.
        descartadas++;
        // @ts-expect-error — RPC nova (migração 0022), ainda não está em database.types.ts.
        await db.rpc("memory_delete_summarize_queue_item", { p_msg_id: row.msg_id });
      } else if (err instanceof SummaryGenerationNotImplementedError) {
        // Diferente de poison-pill: o item é válido, só não é acionável AINDA (capability real de
        // LLM não existe no codebase). Não deleta — fica pra reprocessar quando existir. Não é a
        // mesma starvation do achado de 2026-08-07 porque TODOS os itens desta fila estão nesse
        // mesmo estado hoje (não há item "bom" sendo bloqueado atrás de um poison-pill).
        aguardandoCapability++;
      }
      // Qualquer outro erro (rede/DB — transitório): não deleta, reaparece após o vt (60s) pra
      // retry automático. Sem log de payload — só contador (LGPD).
    }
  }

  return Response.json({
    ok: true,
    consumidas: rows.length,
    resumidas,
    descartadas,
    aguardandoCapability,
    falhas,
  });
});
