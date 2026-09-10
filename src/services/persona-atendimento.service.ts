// Logos Iris — persona-atendimento (docs/specs/persona-atendimento.md)
// Estende o pipeline pós conversation-engine-v1 (camadas 1-2, ADR-027) com dois comportamentos:
// injeção de memória de contato (Story 2, LGPD/ADR-026) e acionamento de handoff por baixa
// confiança (Story 3). Não modifica ConversationEngineService — compilePrompt continua função
// pura (Requisito 6 de conversation-engine-v1.md), este Service só compõe o resultado dela com IO.
//
// Story 1 (sem bloqueio de horário) e Story 4 (tom fixo, sem leitura de dados_negocio) são
// propriedades ESTRUTURAIS de buildEngineContext: o método não recebe nem consulta horário
// comercial, e não lê knowledge_base_entries/dados_negocio — nada aqui pode gatear a resposta
// por horário nem trocar o tom por tenant (bloqueio documentado na spec, não é bug).

import {
  buildEngineContextParamsSchema,
  escalateToHumanParamsSchema,
  type BuildEngineContextParams,
  type EscalateToHumanParams,
} from "@/schemas/persona-atendimento.schema";
import type { ConversationEngineService } from "@/services/conversation-engine.service";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import type { HandoffRepository } from "@/repositories/handoff.repository";
import type { EngineCallContext } from "@/types/persona-atendimento.types";

export interface PersonaAtendimentoServiceDeps {
  engine: ConversationEngineService;
  contactMemoryRepo: ContactMemoryRepository;
  handoffRepo: HandoffRepository;
}

export class PersonaAtendimentoService {
  constructor(private readonly deps: PersonaAtendimentoServiceDeps) {}

  /**
   * Story 1/2/4 — monta (nucleo+persona compilados) + memória de contato, pronto para a chamada
   * ao ModelGateway (spec, "API Contract": não há endpoint HTTP próprio, isto é invocado
   * internamente pelo pipeline pós-debounce).
   */
  async buildEngineContext(params: BuildEngineContextParams): Promise<EngineCallContext> {
    const { tenant_id, contact_id, persona_ativa } = buildEngineContextParamsSchema.parse(params);

    const compiledPrompt = this.deps.engine.compilePrompt({ persona_ativa });
    const summary = await this.deps.contactMemoryRepo.findLatestValidSummary(tenant_id, contact_id);

    return {
      compiledPrompt,
      memoriaContexto: summary?.resumo ?? null,
    };
  }

  /**
   * Story 3 — quando a engine aciona a tool "escalar humano" (sinal de baixa confiança, ver
   * "Gap encontrado" da spec), pausa a conversa via PauseConversation em vez de a Iris inventar
   * uma resposta. Espelha exatamente HandoffRepository.pauseForHandoff (já usado por
   * whatsapp-gateway para o gatilho from_me_detectado) com gatilho='baixa_confianca'.
   */
  async escalateToHuman(params: EscalateToHumanParams): Promise<{ status: "pausada" }> {
    const { tenant_id, conversation_id } = escalateToHumanParamsSchema.parse(params);

    return this.deps.handoffRepo.pauseForHandoff({
      tenant_id,
      conversation_id,
      gatilho: "baixa_confianca",
    });
  }
}
