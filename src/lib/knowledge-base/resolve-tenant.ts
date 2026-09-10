// Logos Iris — TenantKnowledgeBase (knowledge-base-v1)
// Resolve tenant_id a partir do JWT da sessão (nunca confia em tenant_id vindo do client) —
// mesma claim usada pelas policies RLS (ARCHITECTURE.md 1.0: app_metadata.tenant_id). Usado pelos
// 5 Controllers de /api/knowledge-base* — Painel Cliente (não admin, não webhook).

import { getRequestScopedClient } from "@/lib/supabase/server-client";

export type ResolveTenantResult =
  | { ok: true; tenantId: string }
  | { ok: false; status: 401 | 403; code: "UNAUTHENTICATED" | "NO_TENANT_CLAIM"; message: string };

export async function resolveTenantFromRequest(): Promise<ResolveTenantResult> {
  const authClient = await getRequestScopedClient();
  const { data: authData, error: authError } = await authClient.auth.getUser();

  if (authError || !authData.user) {
    return { ok: false, status: 401, code: "UNAUTHENTICATED", message: "Sessão inválida" };
  }

  const appMetadata = authData.user.app_metadata as Record<string, unknown> | undefined;
  const tenantId = appMetadata?.tenant_id;

  if (typeof tenantId !== "string" || tenantId.length === 0) {
    return { ok: false, status: 403, code: "NO_TENANT_CLAIM", message: "Usuário sem tenant_id associado" };
  }

  return { ok: true, tenantId };
}
