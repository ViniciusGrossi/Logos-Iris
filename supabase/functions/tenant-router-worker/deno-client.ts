// Logos Iris — tenant-router-worker: wiring Deno-only do client Supabase (injeção de dependência).
//
// Espelha createServiceClient() (src/lib/supabase/service-client.ts), mas process.env não existe
// no runtime Deno das Edge Functions — aqui a mesma configuração (schema "iris" pinned,
// persistSession off) é montada a partir de Deno.env. Isto é wiring de DI, NÃO lógica de negócio
// duplicada: mesmo espírito de tenant-router.factory.ts do lado Next (que também só monta
// dependências e delega tudo ao Service/Repositories reais).

import { createClient } from "@supabase/supabase-js";
import type { IrisSupabaseClient } from "@/lib/supabase/service-client";
import type { Database } from "@/lib/supabase/database.types";

export function createDenoServiceClient(): IrisSupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ausentes no ambiente da Edge Function (injetados automaticamente pelo runtime Supabase)."
    );
  }

  // schema "iris": mesmo default do produto usado no lado Next (nunca "public" — CLAUDE.md).
  return createClient<Database, "iris">(url, serviceRoleKey, {
    db: { schema: "iris" },
    auth: { persistSession: false },
  });
}
