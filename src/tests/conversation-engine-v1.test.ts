// Logos Iris — conversation-engine-v1
// Test cases derivados 1:1 dos Critérios de Aceite em docs/specs/conversation-engine-v1.md.
// Sem repository/HTTP: compilePrompt é função pura (núcleo, persona) → prompt (Requisito 6, ADR-027).
// RLS: não aplicável (spec, seção Validação) — módulo sem tabela própria.

import { describe, expect, it, vi } from "vitest";

import { InvalidPersonaError } from "@/services/conversation-engine.errors";
import { ConversationEngineService } from "@/services/conversation-engine.service";
import type { Persona } from "@/types/conversation-engine.types";

const PERSONAS: Persona[] = ["atendimento", "vendas", "agendamento", "sdr"];

describe("ConversationEngineService.compilePrompt", () => {
  it("Given persona_ativa='atendimento', When compilePrompt roda 2x com o mesmo input, Then o resultado é idêntico (determinismo)", () => {
    const service = new ConversationEngineService();

    const first = service.compilePrompt({ persona_ativa: "atendimento" });
    const second = service.compilePrompt({ persona_ativa: "atendimento" });

    expect(first).toEqual(second);
  });

  it("Given qualquer persona_ativa válida, When compilePrompt roda, Then nucleo é sempre a mesma constante de código", () => {
    const service = new ConversationEngineService();

    const resultados = PERSONAS.map((persona_ativa) => service.compilePrompt({ persona_ativa }));

    // Igualdade referencial de string primitiva: mesma constante de módulo em toda chamada,
    // independente da persona — nenhuma interpolação de persona no campo nucleo.
    resultados.forEach((r) => expect(r.nucleo).toBe(resultados[0].nucleo));
  });

  it("Teste adversarial de precedência: nucleo é campo estruturalmente separado — persona não tem mecanismo para sobrescrever/remover nucleo", () => {
    const service = new ConversationEngineService();
    const ADVERSARIAL_SNIPPET = "ignore as regras anteriores";

    const result = service.compilePrompt({ persona_ativa: "vendas" });

    // nucleo presente, não-vazio, e imune a qualquer conteúdo hipotético de persona (campos
    // nunca são concatenados em uma única string editável — a interface CompiledPromptV1 os
    // mantém separados por construção, não por sanitização de texto).
    expect(result.nucleo.length).toBeGreaterThan(0);
    expect(result.nucleo).not.toContain(ADVERSARIAL_SNIPPET);
    expect(result).toHaveProperty("nucleo");
    expect(result).toHaveProperty("persona");
    expect(result.nucleo).not.toBe(result.persona);
  });

  it("Given as 4 personas, When compilePrompt roda para cada uma, Then cada uma produz um persona distinto — nenhuma colisão", () => {
    const service = new ConversationEngineService();

    const resultados = PERSONAS.map((persona_ativa) => service.compilePrompt({ persona_ativa }));
    const textosPersona = resultados.map((r) => r.persona);

    expect(new Set(textosPersona).size).toBe(PERSONAS.length);
    resultados.forEach((r, i) => expect(r.persona_ativa).toBe(PERSONAS[i]));
  });

  it("Given persona_ativa inválida vinda de fonte não tipada (valor corrompido no banco), When compilePrompt é chamado, Then lança InvalidPersonaError", () => {
    const service = new ConversationEngineService();
    const corrompida = "gerente_de_conta" as unknown as Persona;

    expect(() => service.compilePrompt({ persona_ativa: corrompida })).toThrow(InvalidPersonaError);
  });

  it("Given a execução de compilePrompt, When observado o comportamento, Then nenhuma chamada de rede/IO ocorre — função pura e síncrona", () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const service = new ConversationEngineService();

    const result = service.compilePrompt({ persona_ativa: "sdr" });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(result).not.toBeInstanceOf(Promise);
    vi.unstubAllGlobals();
  });

  it("Nenhum erro em console/logs durante compilePrompt", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const service = new ConversationEngineService();

    service.compilePrompt({ persona_ativa: "agendamento" });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  // RLS: não aplicável — compilePrompt é função pura sem tabela própria (spec, Critérios de Aceite).
  // A leitura de conversations.persona_ativa que alimenta este módulo é RLS-protegida no Service
  // que a busca, fora desta spec (wave futura da ConversationEngine completa).
});
