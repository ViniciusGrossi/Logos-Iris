import { createServiceClient } from "@/lib/supabase/service-client";
import { WhatsAppGatewayService } from "./whatsapp-gateway.service";
import { EvolutionAdapter } from "@/adapters/whatsapp/evolution.adapter";
import { OpenWaAdapter } from "@/adapters/whatsapp/openwa.adapter";
import { CloudApiAdapter } from "@/adapters/whatsapp/cloud-api.adapter";
import { SupabaseWhatsAppConnectionRepository } from "@/repositories/whatsapp-connection.repository";
import { SupabaseWebhookInboxRepository } from "@/repositories/webhook-inbox.repository";
import { SupabaseTenantLookupRepository } from "@/repositories/tenant-lookup.repository";
import { SupabaseEngineMessageRepository } from "@/repositories/engine-message.repository";
import { SupabaseHandoffRepository } from "@/repositories/handoff.repository";
import { SupabaseQueueRepository } from "@/repositories/queue.repository";
import { SupabaseContactMemoryRepository } from "@/repositories/contact-memory.repository";
import { HumanHandoffService } from "./human-handoff.service";

// ponytail: uma instância por request (mesma decisão de createServiceClient) — singleton/pool
// só se profiling mostrar overhead real. Usado pelo Controller (thin, sem lógica própria).
export function createWhatsAppGatewayService(): WhatsAppGatewayService {
  const db = createServiceClient();
  const connectionRepo = new SupabaseWhatsAppConnectionRepository(db);
  const handoffRepo = new SupabaseHandoffRepository(db);

  return new WhatsAppGatewayService({
    adapters: {
      evolution: new EvolutionAdapter(connectionRepo),
      openwa: new OpenWaAdapter(connectionRepo),
      cloud_api: new CloudApiAdapter(connectionRepo),
    },
    webhookInboxRepo: new SupabaseWebhookInboxRepository(db),
    tenantLookupRepo: new SupabaseTenantLookupRepository(db),
    engineMessageRepo: new SupabaseEngineMessageRepository(db),
    handoffRepo,
    humanHandoffService: new HumanHandoffService({
      handoffRepo,
      contactMemoryRepo: new SupabaseContactMemoryRepository(db),
    }),
    queueRepo: new SupabaseQueueRepository(db),
  });
}
