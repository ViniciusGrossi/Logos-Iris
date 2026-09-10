// Logos Iris — persona-atendimento
// Test cases derivados 1:1 dos Critérios de Aceite em docs/specs/persona-atendimento.md.
// Sem DB real: PersonaAtendimentoService testado isolado via Fakes (mesmo padrão de
// whatsapp-gateway.test.ts / message-debouncer.test.ts). A prova de RLS/decrypt a nível de
// Postgres real fica em supabase/tests/06_persona_atendimento_memory.sql (it.todo abaixo).

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

import { PersonaAtendimentoService } from "@/services/persona-atendimento.service";
import { ConversationEngineService } from "@/services/conversation-engine.service";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import type { HandoffRepository, HandoffTrigger } from "@/repositories/handoff.repository";
import type { ContactMemorySummaryDTO } from "@/types/contact-memory.types";
import type { Persona } from "@/types/conversation-engine.types";

// z.uuid() (Zod v4) exige formato RFC4122 estrito (nibble de versão em [1-8], variante em [89ab]) —
// mesmo padrão de fixture usado em src/tests/model-gateway-v1.test.ts (TENANT_ID com "4"/"8").
const TENANT_A = "00000000-0000-4000-8000-00000000a001";
const TENANT_B = "00000000-0000-4000-8000-00000000b001";
const CONTACT_A1 = "00000000-0000-4000-8000-00000000c0a1";
const CONTACT_B1 = "00000000-0000-4000-8000-00000000c0b1";
const CONVERSATION_A1 = "00000000-0000-4000-8000-00000000d0a1";
const CONVERSATION_B1 = "00000000-0000-4000-8000-00000000d0b1";

// ── Fake ContactMemoryRepository — reimplementa fielmente a regra da migração 0020
// (mais recente e NÃO expirado, `expira_em > now()`) para provar o contrato sem DB real. ──
interface RawSummarySeed {
  tenantId: string;
  contactId: string;
  resumo: string;
  periodoFim: Date;
  expiraEm: Date;
}

class FakeContactMemoryRepo implements ContactMemoryRepository {
  readonly calls: { tenantId: string; contactId: string }[] = [];
  constructor(private readonly rows: RawSummarySeed[] = []) {}

  // findMessagesForPeriod/insertSummary (docs/specs/contact-memory.md, geração/expiração/cascata)
  // não são exercitados por PersonaAtendimentoService (essa spec só LÊ, via findLatestValidSummary
  // acima) — implementação mínima só para satisfazer a interface compartilhada.
  async findMessagesForPeriod(): ReturnType<ContactMemoryRepository["findMessagesForPeriod"]> {
    throw new Error("findMessagesForPeriod não é exercitado por PersonaAtendimentoService");
  }

  async insertSummary(): ReturnType<ContactMemoryRepository["insertSummary"]> {
    throw new Error("insertSummary não é exercitado por PersonaAtendimentoService");
  }

  async findLatestValidSummary(tenantId: string, contactId: string): Promise<ContactMemorySummaryDTO | null> {
    this.calls.push({ tenantId, contactId });

    const now = new Date();
    const candidates = this.rows
      .filter((r) => r.tenantId === tenantId && r.contactId === contactId && r.expiraEm > now)
      .sort((a, b) => b.periodoFim.getTime() - a.periodoFim.getTime());

    const latest = candidates[0];
    if (!latest) return null;

    return {
      id: "summary-1",
      tenant_id: latest.tenantId,
      contact_id: latest.contactId,
      resumo: latest.resumo,
      periodo_inicio: new Date(latest.periodoFim.getTime() - 86_400_000).toISOString(),
      periodo_fim: latest.periodoFim.toISOString(),
      expira_em: latest.expiraEm.toISOString(),
      created_at: latest.periodoFim.toISOString(),
    };
  }
}

// ── Fake HandoffRepository — mesmo shape do usado em whatsapp-gateway.test.ts ──
class FakeHandoffRepo implements HandoffRepository {
  readonly pauseCalls: Parameters<HandoffRepository["pauseForHandoff"]>[0][] = [];
  async findActiveConversationId(): Promise<string | null> {
    return null; // não exercitado por esta spec (persona-atendimento só chama pauseForHandoff)
  }
  async pauseForHandoff(
    params: Parameters<HandoffRepository["pauseForHandoff"]>[0]
  ): Promise<{ status: "pausada" }> {
    this.pauseCalls.push(params);
    return { status: "pausada" };
  }
}

function buildService(rows: RawSummarySeed[] = []) {
  const contactMemoryRepo = new FakeContactMemoryRepo(rows);
  const handoffRepo = new FakeHandoffRepo();
  const engine = new ConversationEngineService();
  const service = new PersonaAtendimentoService({ engine, contactMemoryRepo, handoffRepo });
  return { service, contactMemoryRepo, handoffRepo, engine };
}

describe("PersonaAtendimentoService.buildEngineContext — Story 1 (sem bloqueio de horário)", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("critério #1: mensagem processada fora do horário comercial (madrugada) ainda produz contexto normalmente — nenhum gate de horário bloqueia", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T03:00:00.000Z")); // 3h da manhã, fora de qualquer expediente

    const { service } = buildService();

    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(result.compiledPrompt.persona_ativa).toBe("atendimento");
    expect(result.compiledPrompt.nucleo.length).toBeGreaterThan(0);
  });

  it("estrutural: buildEngineContext não recebe nem consulta nenhum parâmetro de horário — a assinatura não tem como gatear por horário", async () => {
    const { service } = buildService();

    // Se existisse lógica de horário, um input sem esse campo teria de falhar ou se comportar
    // diferente dependendo da hora do sistema; aqui o resultado é idêntico em dois horários opostos.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T14:00:00.000Z")); // horário comercial
    const emHorario = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    vi.setSystemTime(new Date("2026-08-20T23:59:00.000Z")); // fora do horário
    const foraDoHorario = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(emHorario.compiledPrompt).toEqual(foraDoHorario.compiledPrompt);
  });
});

describe("PersonaAtendimentoService.buildEngineContext — Story 2 (injeção de memória)", () => {
  it("critério #2: contato com contact_memory_summaries não expirado — resumo mais recente é incluído no contexto", async () => {
    const { service, contactMemoryRepo } = buildService([
      {
        tenantId: TENANT_A,
        contactId: CONTACT_A1,
        resumo: "Cliente já fez procedimento de limpeza de pele em maio; prefere atendimento à tarde.",
        periodoFim: new Date(Date.now() - 86_400_000),
        expiraEm: new Date(Date.now() + 89 * 86_400_000),
      },
    ]);

    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(result.memoriaContexto).toBe(
      "Cliente já fez procedimento de limpeza de pele em maio; prefere atendimento à tarde."
    );
    expect(contactMemoryRepo.calls).toEqual([{ tenantId: TENANT_A, contactId: CONTACT_A1 }]);
  });

  it("critério: quando há múltiplos resumos válidos, o mais recente (periodo_fim mais alto) é o injetado", async () => {
    const { service } = buildService([
      {
        tenantId: TENANT_A,
        contactId: CONTACT_A1,
        resumo: "resumo antigo (ainda válido)",
        periodoFim: new Date(Date.now() - 30 * 86_400_000),
        expiraEm: new Date(Date.now() + 60 * 86_400_000),
      },
      {
        tenantId: TENANT_A,
        contactId: CONTACT_A1,
        resumo: "resumo mais recente (ainda válido)",
        periodoFim: new Date(Date.now() - 1 * 86_400_000),
        expiraEm: new Date(Date.now() + 89 * 86_400_000),
      },
    ]);

    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(result.memoriaContexto).toBe("resumo mais recente (ainda válido)");
  });

  it("critério #3: contato sem nenhum contact_memory_summaries (cliente novo) — memoriaContexto null, fluxo não quebra", async () => {
    const { service } = buildService([]);

    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(result.memoriaContexto).toBeNull();
    expect(result.compiledPrompt).toBeDefined();
  });

  it("critério #4: contact_memory_summaries expirado (expira_em <= now()) NÃO é injetado — retenção LGPD (ADR-026)", async () => {
    const { service } = buildService([
      {
        tenantId: TENANT_A,
        contactId: CONTACT_A1,
        resumo: "resumo antigo, já vencido — não deve mais ser injetado no contexto",
        periodoFim: new Date(Date.now() - 91 * 86_400_000),
        expiraEm: new Date(Date.now() - 1 * 86_400_000), // vencido ontem
      },
    ]);

    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });

    expect(result.memoriaContexto).toBeNull();
  });
});

describe("PersonaAtendimentoService.buildEngineContext — Story 4 (tom fixo, bloqueada nesta wave)", () => {
  it("critério: persona Atendimento usa sempre o template padrão fixo da camada 2 — mesmo persona/tenant produz o mesmo texto de persona, nenhuma leitura de dados_negocio", async () => {
    const { service } = buildService();

    const r1 = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });
    const r2 = await service.buildEngineContext({
      tenant_id: TENANT_B,
      contact_id: CONTACT_B1,
      persona_ativa: "atendimento",
    });

    // mesmo persona_ativa='atendimento' em 2 tenants distintos → texto de persona idêntico,
    // porque não existe (nesta wave) nenhum parâmetro de tenant/dados_negocio influenciando o tom.
    expect(r1.compiledPrompt.persona).toBe(r2.compiledPrompt.persona);
  });
});

describe("PersonaAtendimentoService.escalateToHuman — Story 3 (handoff por baixa confiança)", () => {
  it("critério #5: tool 'escalar humano' acionada → PauseConversation chamado com gatilho='baixa_confianca'", async () => {
    const { service, handoffRepo } = buildService();

    const result = await service.escalateToHuman({
      tenant_id: TENANT_A,
      conversation_id: CONVERSATION_A1,
    });

    expect(result).toEqual({ status: "pausada" });
    expect(handoffRepo.pauseCalls).toHaveLength(1);
    expect(handoffRepo.pauseCalls[0]).toMatchObject({
      tenant_id: TENANT_A,
      conversation_id: CONVERSATION_A1,
      gatilho: "baixa_confianca" satisfies HandoffTrigger,
    });
  });
});

describe("PersonaAtendimentoService — RLS / isolamento tenant A × tenant B", () => {
  it("defesa em profundidade: buildEngineContext usa sempre o tenant_id do PRÓPRIO input — tenant A nunca lê memória de tenant B", async () => {
    const { service, contactMemoryRepo } = buildService([
      {
        tenantId: TENANT_B,
        contactId: CONTACT_B1,
        resumo: "resumo de outro tenant — nunca deveria vazar pra A",
        periodoFim: new Date(Date.now() - 86_400_000),
        expiraEm: new Date(Date.now() + 89 * 86_400_000),
      },
    ]);

    // tenant A consulta um contact_id que só existe com resumo no tenant B — resultado deve ser null
    const result = await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_B1,
      persona_ativa: "atendimento",
    });

    expect(result.memoriaContexto).toBeNull();
    expect(contactMemoryRepo.calls).toEqual([{ tenantId: TENANT_A, contactId: CONTACT_B1 }]);
  });

  it("escalateToHuman propaga o tenant_id exato do input — nunca mistura tenant A e B em chamadas concorrentes", async () => {
    const { service, handoffRepo } = buildService();

    await service.escalateToHuman({ tenant_id: TENANT_A, conversation_id: CONVERSATION_A1 });
    await service.escalateToHuman({ tenant_id: TENANT_B, conversation_id: CONVERSATION_B1 });

    expect(handoffRepo.pauseCalls).toEqual([
      { tenant_id: TENANT_A, conversation_id: CONVERSATION_A1, gatilho: "baixa_confianca" },
      { tenant_id: TENANT_B, conversation_id: CONVERSATION_B1, gatilho: "baixa_confianca" },
    ]);
  });

  // Prova de DB (RLS + decrypt real), não unit test — mesmo padrão do it.todo() em
  // whatsapp-gateway.test.ts para webhook_inbox.
  it.todo(
    "prova de DB: iris.memory_get_latest_summary é service-role-only e nunca cruza tenant — " +
      "ver supabase/tests/06_persona_atendimento_memory.sql (pgTAP contra o projeto live)"
  );
});

describe("PersonaAtendimentoService — validação de input (Zod antes do service)", () => {
  it("edge case: persona_ativa inválida (fonte não tipada) lança erro explícito antes de compilar", async () => {
    const { service } = buildService();

    await expect(
      service.buildEngineContext({
        tenant_id: TENANT_A,
        contact_id: CONTACT_A1,
        persona_ativa: "gerente_de_conta" as unknown as Persona,
      })
    ).rejects.toThrow();
  });

  it("edge case: tenant_id fora de formato UUID lança erro explícito (nunca chega ao repository)", async () => {
    const { service, contactMemoryRepo } = buildService();

    await expect(
      service.buildEngineContext({
        tenant_id: "nao-e-um-uuid",
        contact_id: CONTACT_A1,
        persona_ativa: "atendimento",
      })
    ).rejects.toThrow();
    expect(contactMemoryRepo.calls).toHaveLength(0);
  });

  it("edge case: conversation_id inválido em escalateToHuman lança erro antes de chamar o repository", async () => {
    const { service, handoffRepo } = buildService();

    await expect(
      service.escalateToHuman({
        tenant_id: TENANT_A,
        conversation_id: "id-invalido",
      })
    ).rejects.toThrow();
    expect(handoffRepo.pauseCalls).toHaveLength(0);
  });
});

describe("PersonaAtendimentoService — nenhum erro em console/logs", () => {
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let logSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  it("critério: fluxo de sucesso (memória + escalonamento) nunca escreve em console.error/console.log", async () => {
    const { service } = buildService([
      {
        tenantId: TENANT_A,
        contactId: CONTACT_A1,
        resumo: "resumo válido",
        periodoFim: new Date(Date.now() - 86_400_000),
        expiraEm: new Date(Date.now() + 89 * 86_400_000),
      },
    ]);

    await service.buildEngineContext({
      tenant_id: TENANT_A,
      contact_id: CONTACT_A1,
      persona_ativa: "atendimento",
    });
    await service.escalateToHuman({ tenant_id: TENANT_A, conversation_id: CONVERSATION_A1 });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
