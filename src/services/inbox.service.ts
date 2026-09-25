// Logos Iris — painel-cliente-v1 (docs/specs/painel-cliente-v1.md)
// InboxService: ListConversations (Requisito 1) + GetConversationMessages (Requisito 2).

import {
  listConversationsQuerySchema,
  getConversationMessagesQuerySchema,
  type ListConversationsQuery,
  type GetConversationMessagesQuery,
} from "@/schemas/conversation-summary.schema";
import type { ConversationSummaryRepository } from "@/repositories/conversation-summary.repository";
import type { PaginatedConversations, PaginatedMessages } from "@/types/conversation-summary.types";

export class InboxService {
  constructor(private readonly repo: ConversationSummaryRepository) {}

  async listConversations(input: ListConversationsQuery): Promise<PaginatedConversations> {
    const params = listConversationsQuerySchema.parse(input);
    const limit = params.limit;
    const offset = (params.page - 1) * limit;

    const { items, total } = await this.repo.listByTenant({
      tenantId: params.tenant_id,
      status: params.status,
      persona: params.persona,
      limit,
      offset,
    });

    return { items, total, page: params.page, limit };
  }

  async getConversationMessages(input: GetConversationMessagesQuery): Promise<PaginatedMessages> {
    const params = getConversationMessagesQuerySchema.parse(input);
    const limit = params.limit;
    const offset = (params.page - 1) * limit;

    const { items, total } = await this.repo.listMessages({
      tenantId: params.tenant_id,
      conversationId: params.conversation_id,
      limit,
      offset,
    });

    return { items, total };
  }
}
