// Logos Iris — human-handoff (docs/specs/human-handoff.md)
// Validação Zod de todo input que cruza a fronteira do HumanHandoffService (_shared.md §4).

import { z } from "zod";

const uuidSchema = z.string().uuid();

export const handoffTriggerSchema = z.enum([
  "botao_painel",
  "from_me_detectado",
  "comando_chat",
  "pedido_cliente",
  "baixa_confianca",
]);

/**
 * PauseConversation (specs/api.contracts.ts) — a assinatura HTTP não carrega `gatilho` no corpo do
 * cliente do painel (o Controller injeta `botao_painel`); os gatilhos internos (from_me_detectado,
 * comando_chat, pedido_cliente, baixa_confianca) chamam o Service com o gatilho já resolvido.
 */
export const pauseConversationSchema = z.object({
  tenant_id: uuidSchema,
  conversation_id: uuidSchema,
  gatilho: handoffTriggerSchema,
  pausada_ate: z.string().datetime({ offset: true }).optional(),
});
export type PauseConversationParams = z.infer<typeof pauseConversationSchema>;

/** ResumeConversation (specs/api.contracts.ts). `confirmado_pelo_dono` omitido = false (Requisito 7). */
export const resumeConversationSchema = z.object({
  tenant_id: uuidSchema,
  conversation_id: uuidSchema,
  confirmado_pelo_dono: z.boolean().default(false),
});
export type ResumeConversationParams = z.infer<typeof resumeConversationSchema>;

/** Params dos gatilhos internos que não recebem `gatilho` do chamador (o Service fixa o valor). */
export const internalHandoffSchema = z.object({
  tenant_id: uuidSchema,
  conversation_id: uuidSchema,
});
export type InternalHandoffParams = z.infer<typeof internalHandoffSchema>;

/**
 * Requisito 3 — o dono digita `#eu` (pausa) ou `#iris` (retoma) NA PRÓPRIA conversa do WhatsApp.
 * Match exato após trim (a spec diz "conteúdo exatamente `#eu`"); case-insensitive porque o teclado
 * do celular capitaliza a primeira letra por padrão. Qualquer outra coisa → null (não é comando).
 */
export function parseChatCommand(content: string): "pause" | "resume" | null {
  const normalized = content.trim().toLowerCase();
  if (normalized === "#eu") return "pause";
  if (normalized === "#iris") return "resume";
  return null;
}
