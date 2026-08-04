import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// ponytail: sem `supabase gen types` rodado ainda pro projeto Iris — Database fica `any` (default
// da própria lib quando não há tipo gerado, não é `any` de lógica de app). Fixar aqui 1x e todo
// repository importa este alias em vez de `SupabaseClient` cru — resolve o mismatch de schema
// ("iris" vs default "public" da lib) sem espalhar o generic em 6 arquivos. Upgrade: gerar
// database.types.ts e trocar o `any` daqui por `Database`.
export type IrisSupabaseClient = SupabaseClient<any, "iris">;

// ponytail: um client por request é suficiente pro volume do webhook; pool/singleton
// só se profiling mostrar overhead de conexão real.
export function createServiceClient(): IrisSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY/NEXT_PUBLIC_SUPABASE_URL ausentes — configure .env.local (ver .env.example)"
    );
  }

  // schema "iris": default do produto (nunca public — CLAUDE.md). service_role bypassa RLS,
  // mas webhook_inbox/whatsapp_connections são RLS-ON-sem-policy (ADR-018) — só service_role acessa.
  return createClient(url, serviceRoleKey, {
    db: { schema: "iris" },
    auth: { persistSession: false },
  });
}
