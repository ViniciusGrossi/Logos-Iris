// Logos Iris — client por-requisição, ligado aos cookies da sessão (Supabase Auth via @supabase/ssr).
// Usado pelos Controllers para resolver auth.uid() (quem está chamando) antes de delegar ao Service.
// Respeita RLS — nunca usar para acesso a tabela admin-only (ver service-client.ts para isso).

import { cookies } from "next/headers";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

export async function getRequestScopedClient() {
  const cookieStore = await cookies();

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY precisam estar definidos (.env)");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // ponytail: rota admin não faz refresh de sessão — set pode falhar fora de Server Action/Route
          // Handler mutável; seguro ignorar aqui. Se sessão expirar, getUser() já retorna erro tratado.
        }
      },
    },
  });
}
