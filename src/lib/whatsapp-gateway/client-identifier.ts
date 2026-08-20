// Achado do review de segurança do gate fase 9 (ALTO-1): o hop MAIS À ESQUERDA de X-Forwarded-For
// é escrito pelo próprio cliente HTTP — um atacante que rotacione esse header a cada requisição
// recebia um bucket novo no rate limiter toda vez e nunca era limitado. Fix: priorizar
// x-vercel-forwarded-for (header injetado pela plataforma Vercel, não sobrescrevível pelo cliente —
// stack de deploy padrão da Logos Tech) e, na ausência dele (self-hosted sem Vercel), usar o hop
// MAIS À DIREITA de X-Forwarded-For — o mais próximo do proxy real, ainda spoofável num self-host
// sem proxy confiável na frente, mas incomparavelmente mais difícil de manipular do que o mais à
// esquerda.

/** Identifica o cliente de origem de uma requisição pra fins de rate limiting. Nunca confia no hop
 * mais à esquerda de X-Forwarded-For (client-controlled). */
export function clientIdentifier(req: Request): string {
  const vercelForwardedFor = req.headers.get("x-vercel-forwarded-for");
  if (vercelForwardedFor) return vercelForwardedFor.trim();

  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwardedFor = req.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const hops = forwardedFor.split(",").map((hop) => hop.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }

  return "unknown";
}
