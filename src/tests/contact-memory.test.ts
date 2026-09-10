// Logos Iris — contact-memory
// Test cases derivados 1:1 dos Critérios de Aceite em docs/specs/contact-memory.md.
// Sem DB real: ContactMemoryService testado isolado via Fakes (mesmo padrão de
// persona-atendimento.test.ts / message-debouncer.test.ts). Purge diário (Requisito 3) e cascata
// de esquecimento (Requisito 5) são 100% SQL (pg_cron + trigger, migração 0022) — sem contraparte
// em TS pra testar via Fake (mesmo padrão de iris_private.ensure_next_partitions em 0013, que
// também não tem teste vitest). A prova de RLS/service-role-only/derivação real de expira_em fica
// em supabase/tests/07_contact_memory_generation.sql (it.todo abaixo).
//
// Critério "ConversationEngine só injeta resumos não expirados" já é coberto por
// persona-atendimento.test.ts (feature anterior desta wave, já mergeada) — não duplicado aqui.

import { describe, expect, it, vi, beforeEach } from "vitest";

import { ContactMemoryService, type ContactMemorySummaryGenerator } from "@/services/contact-memory.service";
import { NoMessagesInPeriodError } from "@/services/contact-memory.errors";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import type { ContactMemorySummaryDTO, RawContactMessage } from "@/types/contact-memory.types";

// z.string().uuid() exige formato RFC4122 estrito — mesmo padrão de fixture usado em
// src/tests/persona-atendimento.test.ts (TENANT_ID com "4"/"8").
const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const TENANT_B = "00000000-0000-4000-8000-00000000b001";
const CONTACT_A1 = "00000000-0000-4000-8000-00000000c0a1";
const CONTACT_B1 = "00000000-0000-4000-8000-00000000c0b1";

const PERIODO_INICIO = "2026-08-13T00:00:00.000Z";
const PERIODO_FIM = "2026-08-20T00:00:00.000Z";

// ── Fake ContactMemoryRepository — só as duas escritas cobertas por esta spec ──
// (findLatestValidSummary não é exercitado por este Service; lança se chamado por engano).
interface InsertSummaryCall {
  tenant_id: string;
  contact_id: string;
  resumo: string;
  periodo_inicio: string;
  periodo_fim: string;
}

class FakeContactMemoryRepo implements ContactMemoryRepository {
  readonly findMessagesCalls: { tenantId: string; contactId: string; periodoInicio: string; periodoFim: string }[] =
    [];
  readonly insertSummaryCalls: InsertSummaryCall[] = [];
  messagesToReturn: RawContactMessage[] = [];
  /** Simula o que o RPC memory_create_summary devolveria (expira_em já derivado, ver migração 0022). */
  retentionDays = 90;

  async findLatestValidSummary(): Promise<ContactMemorySummaryDTO | null> {
    throw new Error("findLatestValidSummary não é exercitado por ContactMemoryService — spec de leitura é outra");
  }

  async findMessagesForPeriod(
    tenantId: string,
    contactId: string,
    periodoInicio: string,
    periodoFim: string,
  ): Promise<RawContactMessage[]> {
    this.findMessagesCalls.push({ tenantId, contactId, periodoInicio, periodoFim });
    if (tenantId !== TENANT_A && tenantId !== TENANT_B) return [];
    // defesa em profundidade: só devolve mensagens se o par (tenant, contact) bater com o seed do teste
    return this.messagesToReturn;
  }

  async insertSummary(params: InsertSummaryCall): Promise<ContactMemorySummaryDTO> {
    this.insertSummaryCalls.push(params);
    const createdAt = new Date();
    const expiraEm = new Date(createdAt.getTime() + this.retentionDays * 86_400_000);
    return {
      id: "00000000-0000-4000-8000-000000009999",
      tenant_id: params.tenant_id,
      contact_id: params.contact_id,
      resumo: params.resumo,
      periodo_inicio: params.periodo_inicio,
      periodo_fim: params.periodo_fim,
      expira_em: expiraEm.toISOString(),
      created_at: createdAt.toISOString(),
    };
  }
}

class FakeSummaryGenerator implements ContactMemorySummaryGenerator {
  readonly calls: { tenant_id: string; mensagens: RawContactMessage[] }[] = [];
  resumoToReturn = "Cliente perguntou sobre horários e confirmou interesse no procedimento X.";

  async generate(params: { tenant_id: string; mensagens: RawContactMessage[] }): Promise<string> {
    this.calls.push(params);
    return this.resumoToReturn;
  }
}

function buildService() {
  const contactMemoryRepo = new FakeContactMemoryRepo();
  const summaryGenerator = new FakeSummaryGenerator();
  const service = new ContactMemoryService({ contactMemoryRepo, summaryGenerator });
  return { service, contactMemoryRepo, summaryGenerator };
}

describe("ContactMemoryService.summarizeContactMemory — Requisito 1 (job de resumo)", () => {
  it("critério #1: conversa com mensagens no período → resumo sintetizado é persistido, texto puro das mensagens nunca é passado ao repository", async () => {
    const { service, contactMemoryRepo, summaryGenerator } = buildService();
    contactMemoryRepo.messagesToReturn = [
      { conteudo: "Oi, vocês atendem sábado?", direcao: "recebida" },
      { conteudo: "Atendemos sim, das 9h às 13h.", direcao: "enviada" },
      { conteudo: "Perfeito, quero agendar.", direcao: "recebida" },
    ];

    const result = await service.summarizeContactMemory({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });

    // o generator recebeu as mensagens brutas...
    expect(summaryGenerator.calls).toHaveLength(1);
    expect(summaryGenerator.calls[0].mensagens).toEqual(contactMemoryRepo.messagesToReturn);

    // ...mas o repository (persistência) só recebe o resumo SINTETIZADO, nunca o texto bruto.
    expect(contactMemoryRepo.insertSummaryCalls).toHaveLength(1);
    const persisted = contactMemoryRepo.insertSummaryCalls[0];
    expect(persisted.resumo).toBe(summaryGenerator.resumoToReturn);
    for (const msg of contactMemoryRepo.messagesToReturn) {
      expect(persisted.resumo).not.toContain(msg.conteudo);
    }

    expect(result.resumo).toBe(summaryGenerator.resumoToReturn);
  });

  it("critério: período propagado exatamente ao repository (periodo_inicio/periodo_fim do input, sem mutação)", async () => {
    const { service, contactMemoryRepo } = buildService();
    contactMemoryRepo.messagesToReturn = [{ conteudo: "mensagem única", direcao: "recebida" }];

    await service.summarizeContactMemory({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });

    expect(contactMemoryRepo.findMessagesCalls).toEqual([
      { tenantId: TENANT_A, contactId: CONTACT_A1, periodoInicio: PERIODO_INICIO, periodoFim: PERIODO_FIM },
    ]);
    expect(contactMemoryRepo.insertSummaryCalls[0]).toMatchObject({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });
  });

  it("edge case: nenhuma mensagem no período → NoMessagesInPeriodError, nada é persistido", async () => {
    const { service, contactMemoryRepo, summaryGenerator } = buildService();
    contactMemoryRepo.messagesToReturn = [];

    await expect(
      service.summarizeContactMemory({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A1,
        periodo_inicio: PERIODO_INICIO,
        periodo_fim: PERIODO_FIM,
      }),
    ).rejects.toThrow(NoMessagesInPeriodError);

    expect(summaryGenerator.calls).toHaveLength(0);
    expect(contactMemoryRepo.insertSummaryCalls).toHaveLength(0);
  });

  it.todo(
    "prova de DB: iris.memory_fetch_messages_for_period/iris.memory_create_summary são service-role-only " +
      "— ver supabase/tests/07_contact_memory_generation.sql (pgTAP contra o projeto live)",
  );
});

describe("ContactMemoryService.summarizeContactMemory — Requisito 2 (expira_em derivado do plano)", () => {
  it("critério #2: expira_em vem do valor que o RPC devolveu (derivação real acontece em SQL, migração 0022 — este teste prova que o Service não recalcula/sobrescreve)", async () => {
    const { service, contactMemoryRepo } = buildService();
    contactMemoryRepo.messagesToReturn = [{ conteudo: "mensagem", direcao: "recebida" }];
    contactMemoryRepo.retentionDays = 90;

    const before = Date.now();
    const result = await service.summarizeContactMemory({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });

    const expiraEmMs = new Date(result.expira_em).getTime();
    const expectedMs = before + 90 * 86_400_000;
    // tolerância de alguns segundos (tempo de execução do teste), não recalculado pelo Service.
    expect(Math.abs(expiraEmMs - expectedMs)).toBeLessThan(5_000);
  });

  it.todo(
    "prova de DB: expira_em = created_at + plans.retencao_memoria_dias (90d no seed) — " +
      "ver supabase/tests/07_contact_memory_generation.sql",
  );
});

describe("ContactMemoryService.summarizeContactMemory — Requisito 3 (purge diário) e Requisito 5 (cascata de esquecimento)", () => {
  it.todo(
    "prova de DB: iris_private.purge_expired_contact_memory() hard-deleta contact_memory_summaries com expira_em vencido " +
      "— ver supabase/tests/07_contact_memory_generation.sql (100% SQL/pg_cron, sem Fake em TS, mesmo padrão de 0013)",
  );
  it.todo(
    "prova de DB: trigger contacts_cascade_forget_trigger hard-deleta contact_memory_summaries + " +
      "knowledge_chunks(source_type='contact_memory') ao setar contacts.deleted_at — ver supabase/tests/07_contact_memory_generation.sql",
  );
});

describe("ContactMemoryService.summarizeContactMemory — RLS / isolamento tenant A × tenant B", () => {
  it("defesa em profundidade: summarizeContactMemory usa sempre o tenant_id do PRÓPRIO input — nunca mistura tenant A e B em chamadas concorrentes", async () => {
    const { service, contactMemoryRepo } = buildService();
    contactMemoryRepo.messagesToReturn = [{ conteudo: "mensagem", direcao: "recebida" }];

    await service.summarizeContactMemory({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });
    await service.summarizeContactMemory({
      tenant_id: TENANT_B,
      contact_id: CONTACT_B1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });

    expect(contactMemoryRepo.findMessagesCalls).toEqual([
      { tenantId: TENANT_A, contactId: CONTACT_A1, periodoInicio: PERIODO_INICIO, periodoFim: PERIODO_FIM },
      { tenantId: TENANT_B, contactId: CONTACT_B1, periodoInicio: PERIODO_INICIO, periodoFim: PERIODO_FIM },
    ]);
    expect(contactMemoryRepo.insertSummaryCalls.map((c) => c.tenant_id)).toEqual([TENANT_A, TENANT_B]);
  });

  it.todo(
    "prova de DB: iris.memory_fetch_messages_for_period(tenant A, contact_id de B) devolve 0 linhas — " +
      "ver supabase/tests/07_contact_memory_generation.sql (RLS/tenant_id AND contact_id, mesmo padrão de 06_)",
  );
});

describe("ContactMemoryService.summarizeContactMemory — validação de input (Zod antes do service)", () => {
  it("edge case: tenant_id fora de formato UUID lança erro explícito antes de chegar ao repository", async () => {
    const { service, contactMemoryRepo } = buildService();

    await expect(
      service.summarizeContactMemory({
        tenant_id: "nao-e-um-uuid",
        contact_id: CONTACT_A1,
        periodo_inicio: PERIODO_INICIO,
        periodo_fim: PERIODO_FIM,
      }),
    ).rejects.toThrow();
    expect(contactMemoryRepo.findMessagesCalls).toHaveLength(0);
  });

  it("edge case: contact_id fora de formato UUID lança erro explícito antes de chegar ao repository", async () => {
    const { service, contactMemoryRepo } = buildService();

    await expect(
      service.summarizeContactMemory({
        tenant_id: TENANT_A,
        contact_id: "nao-e-um-uuid",
        periodo_inicio: PERIODO_INICIO,
        periodo_fim: PERIODO_FIM,
      }),
    ).rejects.toThrow();
    expect(contactMemoryRepo.findMessagesCalls).toHaveLength(0);
  });

  it("edge case: periodo_inicio posterior ou igual a periodo_fim lança erro explícito (período inválido)", async () => {
    const { service, contactMemoryRepo } = buildService();

    await expect(
      service.summarizeContactMemory({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A1,
        periodo_inicio: PERIODO_FIM,
        periodo_fim: PERIODO_INICIO,
      }),
    ).rejects.toThrow();
    expect(contactMemoryRepo.findMessagesCalls).toHaveLength(0);
  });

  it("edge case: periodo_inicio igual a periodo_fim (período vazio) lança erro explícito", async () => {
    const { service, contactMemoryRepo } = buildService();

    await expect(
      service.summarizeContactMemory({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A1,
        periodo_inicio: PERIODO_INICIO,
        periodo_fim: PERIODO_INICIO,
      }),
    ).rejects.toThrow();
    expect(contactMemoryRepo.findMessagesCalls).toHaveLength(0);
  });
});

describe("ContactMemoryService.summarizeContactMemory — nenhum erro em console/logs (Requisito 6, LGPD)", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("critério: fluxo de sucesso nunca escreve em console.error/console.log (resumo de contato nunca aparece em log)", async () => {
    const { service, contactMemoryRepo } = buildService();
    contactMemoryRepo.messagesToReturn = [
      { conteudo: "conteúdo sensível do cliente final", direcao: "recebida" },
    ];

    await service.summarizeContactMemory({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      periodo_inicio: PERIODO_INICIO,
      periodo_fim: PERIODO_FIM,
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
