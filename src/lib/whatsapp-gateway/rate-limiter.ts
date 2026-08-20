// Hardening fase 9, gap #4 — rate limiting básico do endpoint webhook. Antes: nenhum.
//
// Trade-off documentado (autorizado pelo brief a não exigir Redis/Upstash se não houver infra
// pronta pro projeto — não há): janela deslizante em memória, por processo. Em serverless/multi-
// instância (Vercel), cada instância mantém seu PRÓPRIO contador — não é um limite global exato
// entre instâncias, é defesa best-effort contra uma única instância/cliente martelando o endpoint.
// Isso é aceitável aqui porque o tráfego do webhook é server-to-server (o provedor WhatsApp), não
// um enxame de usuários finais distribuídos — o risco que este limite mitiga é webhook mal
// configurado em retry-storm ou abuso pontual, não um ataque distribuído sofisticado. Se o volume
// real justificar um limite exato cross-instância, migrar pra Upstash/Redis é a evolução natural
// (Sync Request candidata, registrada no relatório).
//
// Alternativa considerada e descartada por ora: tabela dedicada reaproveitando o padrão de
// `webhook_inbox` (contagem por janela persistida no Supabase). Descartada porque adicionaria 1
// round-trip de DB síncrono por requisição ao caminho quente do ACK (< 5s exigido pela spec,
// requisito 5) só pra um controle de rate limit que, no volume atual do projeto (poucas dezenas de
// tenants), não paga o custo de latência. Reavaliar se o volume crescer.

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

const buckets = new Map<string, number[]>();

// Limite de chaves rastreadas simultaneamente — evita crescimento ilimitado de memória se um
// atacante variar a chave (ex.: spoofar X-Forwarded-For) pra gerar 1 bucket por requisição.
// Quando o teto é atingido, a entrada mais antiga é descartada (aceita permitir alguma nova chave
// incomum passar sem contagem prévia — trade-off proposital: memória limitada > exatidão perfeita).
const MAX_TRACKED_KEYS = 5000;

export function checkRateLimit(
  key: string,
  config: RateLimitConfig,
  now: number = Date.now()
): RateLimitResult {
  const windowStart = now - config.windowMs;
  const existing = buckets.get(key) ?? [];
  const timestamps = existing.filter((t) => t > windowStart);

  if (timestamps.length >= config.maxRequests) {
    buckets.set(key, timestamps);
    const oldestInWindow = timestamps[0];
    return { allowed: false, retryAfterMs: Math.max(0, oldestInWindow + config.windowMs - now) };
  }

  timestamps.push(now);

  if (!buckets.has(key) && buckets.size >= MAX_TRACKED_KEYS) {
    const oldestKey = buckets.keys().next().value;
    if (oldestKey !== undefined) buckets.delete(oldestKey);
  }
  buckets.set(key, timestamps);

  return { allowed: true, retryAfterMs: 0 };
}

/** Só pra teste — evita vazamento de estado entre casos (o Map é module-level, sobrevive entre `it()`). */
export function __resetRateLimiterForTests(): void {
  buckets.clear();
}
