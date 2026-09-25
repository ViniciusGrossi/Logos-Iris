// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// Validação Zod de todo input que cruza a fronteira do InboxService.

import { z } from "zod";
import { personaSchema } from "@/schemas/conversation-engine.schema";

export const CONVERSATION_STATUSES = ["ativa", "pausada", "encerrada"] as const;

// ── GET /api/conversations?status=&persona=&page=&limit= (paginação obrigatória) ──
export const listConversationsQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  status: z.enum(CONVERSATION_STATUSES).optional(),
  persona: personaSchema.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListConversationsQuery = z.input<typeof listConversationsQuerySchema>;

// ── GET /api/conversations/:id/messages?page=&limit= ──
export const getConversationMessagesQuerySchema = z.object({
  tenant_id: z.string().uuid(),
  conversation_id: z.string().uuid(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type GetConversationMessagesQuery = z.input<typeof getConversationMessagesQuerySchema>;
