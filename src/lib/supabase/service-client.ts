// Logos Iris — client service-role. Bypassa RLS por definição (ADR-018, ADR-030).
// Server-only: nunca importar de código que roda no browser. Usado pelos Repositories
// de tabelas admin-only/globais (ex.: iris.model_registry) via getServiceRoleClient(),
// e pelos Repositories do whatsapp-gateway (schema fixado em "iris") via createServiceClient().

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { Database } from "./database.types";

export type IrisSupabaseClient = SupabaseClient<Database, "iris">;

let cached: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (cached) return cached;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY precisam estar definidos (.env)");
  }

  cached = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

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
  return createClient<Database, "iris">(url, serviceRoleKey, {
    db: { schema: "iris" },
    auth: { persistSession: false },
  });
}
