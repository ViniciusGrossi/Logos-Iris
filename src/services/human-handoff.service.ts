// Logos Iris — HumanHandoffService (docs/specs/human-handoff.md, módulo ★)
// Casa canônica dos 5 gatilhos de pausa + retomada nunca silenciosa. Independente de protocolo:
// os Controllers HTTP (POST /api/conversations/:id/pause|resume) e os gatilhos internos
// (from_me_detectado via WhatsAppGateway, comando_chat via webhook, pedido_cliente/baixa_confianca
// via tool de escalonamento da ConversationEngine) chamam os métodos abaixo.
//
// Toda pausa/retomada é sempre por conversation_id (Requisito 6) — nenhum método aceita ou opera
// sobre "todas as conversas do tenant".

import {
  internalHandoffSchema,
  parseChatCommand,
  pauseConversationSchema,
  resumeConversationSchema,
  type InternalHandoffParams,
  type PauseConversationParams,
  type ResumeConversationParams,
} from "@/schemas/human-handoff.schema";
import { ConversationEncerradaError, ConversationNotFoundError } from "@/services/human-handoff.errors";
import type { HumanHandoffRepository } from "@/repositories/handoff.repository";
import type { ContactMemoryRepository } from "@/repositories/contact-memory.repository";
import type { HandoffDossie, PauseResult, ResumeResult } from "@/types/human-handoff.types";

export interface HumanHandoffServiceDeps {
  handoffRepo: HumanHandoffRepository;
  /** Só usado para a linha 2 do dossiê de `pedido_cliente` (Requisito 4 / Story 24). */
  contactMemoryRepo: ContactMemoryRepository;
}

/**
 * Subconjunto de HumanHandoffService que o WhatsAppGatewayService consome (gatilhos from_me e
 * comando_chat). Interface própria para o teste do Gateway poder fakear sem instanciar o Service
 * inteiro — HumanHandoffService satisfaz estruturalmente.
 */
export interface HumanHandoffTriggers {
  pauseConversation(params: PauseConversationParams): Promise<PauseResult>;
  resumeConversation(params: ResumeConversationParams): Promise<ResumeResult>;
  pauseFromOwnerMessage(params: InternalHandoffParams): Promise<PauseResult>;
}

/** Limiar de "pausa longa" (Requisito 7) — configurável, request-time, sem cron (spec, Restrições). */
function longPauseThresholdMs(): number {
  const hours = Number(process.env.HANDOFF_LONG_PAUSE_HOURS ?? "24");
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 24;
  return safe * 60 * 60 * 1000;
}

/** Auto-pausa por `from_me_detectado` (Requisito 2) — "N horas" configurável, sem migration nova. */
function autoPauseUntilISO(now: number = Date.now()): string {
  const hours = Number(process.env.HANDOFF_AUTO_PAUSE_HOURS ?? "2");
  const safe = Number.isFinite(hours) && hours > 0 ? hours : 2;
  return new Date(now + safe * 60 * 60 * 1000).toISOString();
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1).trimEnd()}…`;
}

export class HumanHandoffService {
  constructor(private readonly deps: HumanHandoffServiceDeps) {}

  /** Re-exporta o parser de comando de chat (`#eu`/`#iris`) — o webhook do Gateway usa isto. */
  static parseChatCommand = parseChatCommand;

  /**
   * Gatilho `botao_painel` (HTTP) e `comando_chat` (#eu). Também é o método que os gatilhos internos
   * delegam. Sempre por conversation_id; nunca afeta outra conversa do tenant.
   */
  async pauseConversation(params: PauseConversationParams): Promise<PauseResult> {
    const parsed = pauseConversationSchema.parse(params);
    const conversa = await this.assertConversaPausavel(parsed.tenant_id, parsed.conversation_id);

    // Conversa já pausada: registra o novo gatilho mesmo assim (Requisito 9 — cada pausa é
    // registrada; múltiplos gatilhos podem legitimamente incidir) e mantém pausada.
    void conversa;
    return this.deps.handoffRepo.pauseForHandoff({
      tenant_id: parsed.tenant_id,
      conversation_id: parsed.conversation_id,
      gatilho: parsed.gatilho,
      pausada_ate: parsed.pausada_ate,
    });
  }

  /**
   * Retomada NUNCA silenciosa (Requisito 7/8). Se a pausa foi mais longa que o limiar configurado e
   * o dono não confirmou explicitamente, responde `aguardando_confirmacao` e não reativa nada.
   */
  async resumeConversation(params: ResumeConversationParams): Promise<ResumeResult> {
    const parsed = resumeConversationSchema.parse(params);
    const conversa = await this.assertConversaPausavel(parsed.tenant_id, parsed.conversation_id);

    if (conversa.status === "ativa") {
      // Idempotente — retomar uma conversa já ativa não é erro e não gera evento.
      return { status: "ativa" };
    }

    const aberto = await this.deps.handoffRepo.findOpenHandoffEvent(parsed.tenant_id, parsed.conversation_id);
    const pausaLonga =
      aberto !== null && Date.now() - Date.parse(aberto.acionado_em) >= longPauseThresholdMs();

    if (pausaLonga && !parsed.confirmado_pelo_dono) {
      // Requisito 7 — não reativa, não reenvia nada, aguarda confirmação explícita do dono.
      return { status: "aguardando_confirmacao" };
    }

    await this.deps.handoffRepo.activateConversation(parsed.tenant_id, parsed.conversation_id);
    if (aberto) {
      await this.deps.handoffRepo.resolveHandoffEvent(
        parsed.tenant_id,
        aberto.id,
        parsed.confirmado_pelo_dono === true,
      );
    }
    return { status: "ativa" };
  }

  /**
   * Gatilho `from_me_detectado` (Requisito 2, ADR-029) — o dono respondeu do próprio celular.
   * Auto-pausa por N horas. Chamado pelo WhatsAppGatewayService após normalizar `from_me`.
   */
  async pauseFromOwnerMessage(params: InternalHandoffParams): Promise<PauseResult> {
    const parsed = internalHandoffSchema.parse(params);
    return this.pauseConversation({
      tenant_id: parsed.tenant_id,
      conversation_id: parsed.conversation_id,
      gatilho: "from_me_detectado",
      pausada_ate: autoPauseUntilISO(),
    });
  }

  /**
   * Gatilho `pedido_cliente` (Requisito 4 / Story 24) — o cliente final pediu explicitamente uma
   * pessoa. Pausa + monta o dossiê de 3 linhas para o humano que vai assumir.
   */
  async escalateByCustomerRequest(
    params: InternalHandoffParams,
  ): Promise<{ status: "pausada"; dossie: HandoffDossie }> {
    const parsed = internalHandoffSchema.parse(params);
    const conversa = await this.assertConversaPausavel(parsed.tenant_id, parsed.conversation_id);

    await this.deps.handoffRepo.pauseForHandoff({
      tenant_id: parsed.tenant_id,
      conversation_id: parsed.conversation_id,
      gatilho: "pedido_cliente",
    });

    const [summary, totalEventos] = await Promise.all([
      this.deps.contactMemoryRepo.findLatestValidSummary(parsed.tenant_id, conversa.contact_id),
      this.deps.handoffRepo.countHandoffEvents(parsed.tenant_id, parsed.conversation_id),
    ]);

    // LGPD (Segurança da spec): linhas derivadas só de fontes já cifradas (contact_memory, decifrado
    // server-side) + metadados estruturais. Truncado — nunca reexpõe transcrição bruta.
    const dossie: HandoffDossie = {
      linhas: [
        `Motivo: o cliente pediu explicitamente para falar com uma pessoa (${new Date().toISOString()}).`,
        summary
          ? `Histórico: ${truncate(summary.resumo, 180)}`
          : "Histórico: sem memória registrada para este contato.",
        `Conversa: aberta desde ${conversa.created_at}, persona "${conversa.persona_ativa}", ${totalEventos} handoff(s) registrado(s).`,
      ],
    };

    return { status: "pausada", dossie };
  }

  /**
   * Gatilho `baixa_confianca` (Requisito 5) — a ConversationEngine sinaliza confiança abaixo do
   * limiar e pausa ANTES de enviar qualquer resposta incerta. Chamado pela tool de escalonamento.
   */
  async escalateByLowConfidence(params: InternalHandoffParams): Promise<PauseResult> {
    const parsed = internalHandoffSchema.parse(params);
    return this.pauseConversation({
      tenant_id: parsed.tenant_id,
      conversation_id: parsed.conversation_id,
      gatilho: "baixa_confianca",
    });
  }

  private async assertConversaPausavel(tenantId: string, conversationId: string) {
    const conversa = await this.deps.handoffRepo.getConversation(tenantId, conversationId);
    if (!conversa) throw new ConversationNotFoundError(conversationId);
    if (conversa.status === "encerrada") throw new ConversationEncerradaError(conversationId);
    return conversa;
  }
}
