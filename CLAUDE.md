# Logos Iris — Context

## Sistema
Plataforma SaaS de agentes de IA para atendimento via WhatsApp. Quatro tipos de agentes (Atendimento, Vendas, Agendamento, SDR) rodando na mesma engine de conversação, multi-tenant, conectados ao WhatsApp próprio do cliente via QR code (Evolution API + fallbacks). Dirigido a PMEs e setor público.

**produto_tipo:** saas-premium
**Stack:** padrão Logos Tech (Next.js 15 + Tailwind v4 + Shadcn + Supabase + Vercel). Desvios documentados em ARCHITECTURE.md:
- Multi-modelo com roteamento: chinês (GLM/Kimi/DeepSeek/MiniMax) em tier básico, Claude/GPT-4o em premium
- Gateway WhatsApp 3 camadas: Evolution (primário) → OpenWA (fallback) → API oficial Meta (premium)
- Prompt em 4 camadas: núcleo imutável (Logos) → persona → artesanal (Vinicius) → enriquecimento cliente

## Sessão — LEIA PRIMEIRO
1. Ler `STATE-PROJECT.md` (frontmatter) → onde o projeto está
2. Invocar **`/logos`** — o orquestrador roteia a fase, as skills e os workers
3. Nunca decidir "qual skill usar" de cabeça — o /logos decide pelo playbook da fase

## Fontes de verdade (ordem de precedência)
1. `docs/planejamento-fable.md` — insumo bruto da Fase 1 (candidato a decisão, sob interrogação)
2. `specs/api.contracts.ts` + `specs/product.schema.json` — contratos (mudam SÓ via Spec Sync Request)
3. `docs/ideia.md` — síntese da Fase 1 (problema sem solução pressuposta)
4. `docs/PRD.md` — produto (Fase 2)
5. `docs/ARCHITECTURE.md` — técnica + ADRs (Fase 3)
6. `docs/design-system.md` + protótipo — visual (Fase 4)
7. `specs/registry.json` — wave decomposition (Fase 5)
8. `STATE-PROJECT.md` — estado (único arquivo de estado)

## Decisões Já Travadas [DECISÃO Vinicius]
- Identidade híbrida aprovada: agente se apresenta como "assistente da [empresa]", não nega ser IA
- Gateway 3 camadas (Evolution → OpenWA → API oficial)
- Multi-modelo com preferência chinesa em tier básico
- 4 camadas de prompt com artesanal por tenant
- Enriquecimento guiado (não free-text, estruturado com validação)
- Handoff multi-layer (botão + FromMe detection + comando + pedido cliente + baixa confiança)
- Memória por contato (resumos, não transcrição — LGPD)
- Voz clonada como add-on premium
- Escopo de produto completo (não MVP)

## SDD — Spec Sync Loop
Antes de gerar código: ler a spec da feature. Campo/endpoint não previsto → **NÃO implementar** → Spec Sync Request (acumulam em batch por wave). Código nunca diverge dos contratos sem aprovação.

## Regras Inegociáveis
- Controller → Service → Repository → Supabase (nunca pular)
- Zero `any` no TypeScript
- Validação Zod em todo input
- RLS ativo em toda tabela (policy por tenant_id)
- Paginação em toda listagem
- Operações pesadas em background job (extração de documento, embeddings, auditoria)
- Secrets só via .env
- Tailwind v4 = CSS-first: tokens em `@theme` no globals.css — **proibido tailwind.config.js**
- Dados em hooks, nunca em componentes
- Nenhum console.log com dados sensíveis, contatos finais ou dados de cliente

## Multi-Agent
- Workers spawnam via /logos com SOP — cap **2 simultâneos**
- Workers de escrita: worktree isolado · Reviewers: read-only
- Gates humanos (únicos pontos de parada): Ideia lock (grill-me) · PRD lock · Handshake Visual · Specs batch · Sync Requests · QA Mental · Deploy

## Lições deste projeto
Ao ser corrigido por Vinicius: registrar em `STATE-PROJECT.md → ## Lições` antes de continuar.

## Knowledge (just-in-time — não carregar tudo)
- Aprendizados: `../../memoria/learnings.md` (ler antes de tarefa complexa)
- Patterns: `../../02-Knowledge/patterns.md` · ADRs: `../../02-Knowledge/decisoes.md`
- Bugs conhecidos: `../../02-Knowledge/bugs-e-solucoes.md`
