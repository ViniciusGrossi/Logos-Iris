// Logos Iris — contact-memory (docs/specs/contact-memory.md)
// Erros tipados — nunca throw genérico nem 500 cru (_shared.md §4, CLAUDE.md).

export class ContactMemoryError extends Error {
  constructor(
    message: string,
    public readonly code: string,
  ) {
    super(message);
    this.name = "ContactMemoryError";
  }
}

/**
 * summarizeContactMemory chamado para um (tenant_id, contact_id, período) sem nenhuma mensagem —
 * não há o que resumir. Falha explícita em vez de gravar um resumo vazio/inventado (Requisito 1);
 * o enqueue diário (iris_private.enqueue_contact_memory_summarization, migração 0022) já filtra
 * contatos sem mensagem nova, então este erro só deveria aparecer em chamada direta fora do fluxo
 * do job — mantido tipado para o worker poder tratar como item descartável (não retry infinito).
 */
export class NoMessagesInPeriodError extends ContactMemoryError {
  constructor(contactId: string) {
    super(
      `Nenhuma mensagem encontrada no período informado para o contato ${contactId} — nada a resumir`,
      "NO_MESSAGES_IN_PERIOD",
    );
    this.name = "NoMessagesInPeriodError";
  }
}

/**
 * Lançado pelo ContactMemorySummaryGenerator "de produção" (contact-memory-summarizer-worker) —
 * a heurística/modelo de sumarização em si é Fora de Escopo desta spec ("usa ModelGateway já
 * especificado... não implementa lógica de prompt"), e o codebase ainda não tem NENHUM client de
 * invocação real de LLM (ModelGatewayService.routeModel só ESCOLHE o modelo, não chama nenhuma
 * API — ver src/services/model-gateway.service.ts). O worker trata este erro como "não acionável
 * ainda" (não deleta da fila — mensagem não é poison-pill, só aguarda a capability real), nunca
 * como sucesso silencioso: nenhum resumo fabricado/heurístico é gravado em resumo_enc.
 */
export class SummaryGenerationNotImplementedError extends ContactMemoryError {
  constructor() {
    super(
      "Geração real de resumo via LLM ainda não implementada no codebase (ModelGateway só tem routeModel, " +
        "sem client de completion) — mensagem mantida na fila para reprocesso quando a capability existir",
      "SUMMARY_GENERATION_NOT_IMPLEMENTED",
    );
    this.name = "SummaryGenerationNotImplementedError";
  }
}
