// Logos Iris — debouncer-flush-worker: wiring Deno-only do client Supabase (injeção de dependência).
// Mesmo espírito de tenant-router-worker/deno-client.ts — process.env não existe no runtime Deno,
// aqui a mesma configuração (schema "iris" pinned, persistSession off) é montada via Deno.env.

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

  return createClient<Database, "iris">(url, serviceRoleKey, {
    db: { schema: "iris" },
    auth: { persistSession: false },
  });
}
