import { createServiceClient } from "@/lib/supabase/service-client";
import { SupabaseHandoffRepository } from "@/repositories/handoff.repository";
import { SupabaseContactMemoryRepository } from "@/repositories/contact-memory.repository";
import { HumanHandoffService } from "./human-handoff.service";

// ponytail: uma instância por request (mesma decisão de createWhatsAppGatewayService) — o client
// service_role bypassa RLS, e os Repositories filtram por tenant_id explicitamente (defesa em
// profundidade além das policies de iris.conversations/iris.handoff_events, migração 0005).
export function createHumanHandoffService(): HumanHandoffService {
  const db = createServiceClient();
  return new HumanHandoffService({
    handoffRepo: new SupabaseHandoffRepository(db),
    contactMemoryRepo: new SupabaseContactMemoryRepository(db),
  });
}
