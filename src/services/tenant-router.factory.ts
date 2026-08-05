import { createServiceClient } from "@/lib/supabase/service-client";
import { TenantRouterService } from "./tenant-router.service";
import { SupabaseTenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import { SupabaseWebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import { SupabaseConversationRoutingRepository } from "@/repositories/conversation-routing.repository";

// ponytail: uma instância por invocação do worker (mesma decisão de createServiceClient).
export function createTenantRouterService(): TenantRouterService {
  const db = createServiceClient();
  return new TenantRouterService({
    tenantLookupRepo: new SupabaseTenantLookupRepository(db),
    webhookInboxRepo: new SupabaseWebhookInboxRepository(db),
    conversationRoutingRepo: new SupabaseConversationRoutingRepository(db),
  });
}
