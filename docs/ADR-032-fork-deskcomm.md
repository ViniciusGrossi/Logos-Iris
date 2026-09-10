# ADR-032 — Fork do DeskcommCRM como base do Logos Iris

> Status: **Aprovado** (Vinicius, 2026-08-26)
> Origem: `/ingest https://github.com/melgarafael/DeskcommCRM`
> Substitui: Estratégia anterior de build do zero (Fase 7 em diante)

---

## Contexto

O Logos Iris está na Fase 7 (Build Backend — Wave 0), com 5 features de backend implementadas, zero frontend, e um backlog de 10+ features planejadas.

Paralelamente, o DeskcommCRM — projeto open source brasileiro (MIT, Rafael Melgar) — entrega essencialmente o mesmo produto: agente de IA no WhatsApp com CRM, multi-tenancy RLS, LGPD nativa, RAG por tenant, inbox/kanban/pipeline, WAHA integrado. Está em v1.0.0 (2.607 commits, 644⭐, 302 forks), com 169 route handlers, 221+ testes, CI/CD ativo.

## Decisão

**Forkar o DeskcommCRM como base do Logos Iris**, em vez de continuar a construção do zero.

O DeskcommCRM vira a plataforma-base (engine de WhatsApp, multi-tenancy, CRM, RAG, LGPD, UI). O Logos Iris vira uma distribuição verticalizada sobre essa base, adicionando as diferenciações do PRD/ADRs existentes.

## Justificativa

| Fator | Build do zero | Fork DeskcommCRM |
|---|---|---|
| Time-to-market | 6-12 meses | 1-2 meses para rebrand + diferenciais |
| Funcionalidades prontas | 5 features de backend | 70%+ do roadmap já implementado |
| WhatsApp | Adapters em construção | WAHA Plus funcionando, multi-número |
| Frontend | Zero | App completo (inbox, kanban, pipeline) |
| Qualidade | 16 testes | 221+ testes, invariantes, CI/CD |
| LGPD | ADRs, não implementado | Redact, anonimização, audit — implementado |
| Licença | Interna | MIT — fork, modificação, uso comercial livre |
## O que o DeskcommCRM entrega (não precisa reconstruir)

1. ✅ WhatsApp via WAHA Plus (multi-número, webhook HMAC, throttle anti-ban, STOP detection)
2. ✅ Multi-tenancy com RLS em toda tabela
3. ✅ CRM completo: inbox em tempo real, kanban, customer 360, pipeline
4. ✅ Agentes de IA com RAG por tenant, análise de sentimento, handoff IA→humano
5. ✅ API REST `/api/v1/` com 169 handlers, Zod, audit log
6. ✅ LGPD nativa: redact, data_request, anonimização, audit append-only
7. ✅ Event sourcing (`event_log` + workers via cron), idempotência
8. ✅ MCP: CRM exposto como tools para agentes externos
9. ✅ UI completa (Next.js 16 + shadcn/ui new-york + Tailwind)
10. ✅ Auth (Supabase Auth + MFA TOTP opcional + RBAC)
11. ✅ Deploy self-host com 1 comando (Docker Compose)
12. ✅ Testes: 221+ unitários, 56 invariantes de banco, 19 E2E

## O que o Logos Iris adiciona (diferenciais)

| Diferencial | ADR | Como implementar |
|---|---|---|
| Model Gateway multi-provider (tier chinês) | ADR-025 | Novo `lib/ai/providers/` com strategy pattern |
| Prompt de 4 camadas | ADR-027 | Novo `lib/ai/prompts/` com builder + cache de prefixo |
| 4 Personas (Anfitriã/Consultora/Concierge/SDR) | PRD | Sistema de personas sobre o agente existente |
| Painel Admin Logos (separado do cliente) | PRD | Nova área `/admin` |
| Feature Gating por plano | ADR-030 | `FeatureGateService` + claim JWT |
| Cost Observability por tenant | PRD | Nova tabela `cost_log` + dashboard |
| Fila pgmq + idempotência de webhook | ADR-028 | Substitui/melhora `event_log` com pgmq |
| Retenção e direito ao esquecimento | ADR-026 | Anonimização + hard-delete seletivo |
| Normalização `fromMe` + auto-pausa | ADR-029 | Teste de contrato por adapter |
| Branding Logos Iris | — | Rebrand completo: nome, logo, cores, copy |

## Estratégia de Fork

- **Branch `main`** = DeskcommCRM upstream (sincronizada via `git merge upstream/main`)
- **Branch `iris`** = distribuição Logos Iris com todos os diferenciais
- **Contribuir upstream** sempre que possível (correções, melhorias genéricas)
- **Diffs mínimos** — quanto menos divergir, mais fácil sincronizar

### Fases da Integração

```
Fase A: FORK & SETUP (1-2 dias)
  └── Fork GitHub → clone → instalar → rodar testes → validar ambiente

Fase B: REBRAND (3-5 dias)
  └── Nome, cores, logo, copy, manter crédito original

Fase C: ADAPTAR CORE (2-3 semanas)
  └── Model Gateway, Prompt 4 camadas, 4 personas, Admin, Feature Gating, Cost

Fase D: LGPD & COMPLIANCE (1 semana)
  └── Retenção, pgmq, idempotência, normalização fromMe

Fase E: POLIMENTO & LANÇAMENTO (1-2 semanas)
  └── Testes, deploy staging, WhatsApp real, piloto
```

## Destino do código atual do Iris

O código existente (Fase 7, Wave 0) não é descartado — vira referência de design:

| Artefato | Destino |
|---|---|
| `model-gateway.service.ts` | Referência para Model Gateway multi-provider |
| `conversation-engine.service.ts` | Referência para Prompt 4 camadas |
| `whatsapp-gateway.service.ts` | Referência para melhorias no adapter WAHA |
| `tenant-router.service.ts` | Lógica de roteamento a integrar |
| `supabase/migrations/0001-0016` | Schema de referência para tabelas novas |
| `docs/PRD.md`, `docs/ideia.md` | Documentação de produto — continua válida |

## Riscos

| Risco | Mitigação |
|---|---|
| Divergência do upstream | Diffs pequenos, contribuir upstream, merge frequente |
| Dependência de maintainer externo | MIT — fork sobrevive independente; comunidade ativa mitiga |
| Stack mais nova (Next 16 vs 15) | Upgrade natural; Deskcomm já está mais moderno |
| Complexidade herdada (987 arquivos) | Documentação extensa; `CLAUDE.md` como guia |
| Conflito de schema (`public` vs `iris`) | Migrar para `public` ou adaptar namespaces |

*ADR-032 aprovada por Vinicius em 2026-08-26.*