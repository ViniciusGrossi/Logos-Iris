---
title: "Logos Iris — State of Project"
date: 2026-07-11
# ════════════════════════════════════════════════════
# MÁQUINA — lido por /logos e hooks. Não renomear campos.
# ════════════════════════════════════════════════════
fase_atual: "6"
etapa_atual: "Build Banco"
# produto_tipo: saas-premium | dashboard | landing | mvp
produto_tipo: "saas-premium"
proximo_passo: "/logos — Fase 6: /supabase-postgres-best-practices (review inline) → spawn worker dba (schema core + RLS + pgTAP) → /logos next"
# fases_skipped: preenchido pelo init conforme produto_tipo
fases_skipped: []
# gates: ex { fase_1: pass, fase_2: pass }  ·  features: ex { auth: { spec: approved, built: true } }
gates: { fase_1: "pass", fase_2: "pass", fase_3: "pass", fase_4: "pass", fase_5: "pass" }
features: {
  whatsapp-gateway: { spec: "approved", wave: 0, built: false },
  tenant-router-queue: { spec: "approved", wave: 0, built: false },
  message-debouncer: { spec: "approved", wave: 0, built: false },
  model-gateway-v1: { spec: "approved", wave: 0, built: false },
  conversation-engine-v1: { spec: "approved", wave: 0, built: false },
  persona-atendimento: { spec: "approved", wave: 1, built: false },
  persona-agendamento: { spec: "approved", wave: 1, built: false },
  knowledge-base-v1: { spec: "approved", wave: 1, built: false },
  contact-memory: { spec: "approved", wave: 1, built: false },
  human-handoff: { spec: "approved", wave: 1, built: false },
  painel-cliente-v1: { spec: "approved", wave: 1, built: false },
  feature-gating-v1: { spec: "approved", wave: 1, built: false },
  cost-observability-v1: { spec: "approved", wave: 1, built: false }
}
# overrides: ex [{ gate: "sdd-auth", motivo: "...", data: "..." }]
overrides: []
# ════════════════════════════════════════════════════
# HUMANO
# ════════════════════════════════════════════════════
# status: 🟢 Ativo | 🟡 Novo/Pausa | 🔴 Bloqueado
status: "🟢 Ativo"
tags: [status, roadmap]
---

# ESTADO — Logos Iris

> Driver único do projeto. A skill `/logos` lê o frontmatter para rotear
> e atualiza este arquivo ao fim de cada etapa. Editar à mão só o corpo.

## Em Andamento
- [ ] Fase 6: Build Banco — review inline (`/supabase-postgres-best-practices`) → worker `dba` (schema core + RLS + pgTAP) → `/logos next`

## Concluído
- [2026-07-12] Fase 5 — Decomposition. `docs/tasks.md`: 22 tracer bullets em 5 waves (0 Fundação · 1 Atendimento+Agendamento vendável cedo · 2 Vendas+SDR · 3 camada artesanal · 4 Admin+Billing), granularidade ≤4h, dependências mapeadas, HITL/AFK marcados. `/to-issue` e `/gsd-plan-phase` desviados por incompatibilidade de skill (mesma classe de bug de fase-01/02, ver Lições) — decomposição feita manualmente. 13 specs completas draftadas em batch (2 workers paralelos) pra Wave 0+1 — template `spec-feature-v2.md`, TDD oracle (Given/When/Then por critério de aceite). `specs/registry.json` criado: 13 features `approved` (wave 0+1) + 8 `draft` sem spec ainda (wave 2-4, spec própria no início de cada wave). `/grill-me` resolveu 4 branches: (1) baixa_confiança (HumanHandoff ★) = tool-call de escalonamento da própria LLM, sem score numérico; (2) endpoint QR-pareamento WhatsApp adiado pra wave 4 (painel-admin-completo), não bloqueia build atual; (3) migration `tenants.timezone` aprovada (gap ARCHITECTURE.md, task 8.1); (4) escopo do gate = Wave 0+1 como MVP prático, Waves 2-4 com spec perto do build (mitiga risco do PRD "construir demais antes de feedback real"). Gap de paginação em `GET /api/admin/model-registry` aceito como está (tabela pequena/global). 🔒 Specs Batch apresentado (índice 1 linha/feature) e aprovado por Vinicius. gates.fase_5: pass. Avançando para Fase 6: Build Banco.
- [2026-07-11] Fase 4 — Design. Protótipo real em Next.js (Inbox, Dashboard, Admin Tenants) via `/frontend-design:frontend-design` (direção "Manhã Clara — restrained", registrada em design-system.md). Handshake Visual aprovado por Vinicius. Pós-aprovação: polish de animação nas 3 telas (stagger, hover-lift, pane-transition, pulsing unread dot, usage-bar fill) com vocabulário de motion do design-system (`--duration-base`, `--ease-out-exp`, sem bounce). Auditoria pós-aprovação: taste-skill fora de escopo para este artefato (rubrica é landing/portfolio, não dashboard/data-table/chat-UI — aplicados só os princípios genéricos: consistência de cor/forma, motion motivado, estados de feedback) + `/polish` 22 pontos rodado, 1 finding (cores hardcoded `bg-neutral-100`/Tailwind palette em `status-dot.tsx` e `message-bubble.tsx`, bypassando `@theme`) corrigido na raiz: novos tokens `--status-ok/idle/off` em globals.css (light+dark), dissociados do espectro de persona conforme design-system.md. Screenshots regerados (1440/375) em `docs/design-refs/prototype/` e semeados em `docs/design-refs/seed/` (baseline fase 8). `npx tsc --noEmit` limpo. Gate fase_4 validado 7/7 (tokens, @theme, protótipo navegável, screenshots, handshake, auditoria, direção registrada). gates.fase_4: pass. Avançando para Fase 5: Decomposition.
- [2026-07-09] Fase 3 — Arquitetura. @arquiteto-sistemas entregou proposta completa (modelagem, 7 ADRs, pgcrypto, 6 riscos). `/grill-me` travou 2 decisões: (1) Edge agora, worker quando doer (ADR-031); (2) Provedor chinês SÓ no tier básico + minimização PII + golden set qualidade (ADR-025). docs/ARCHITECTURE.md escrito com 7 ADRs, modelagem completa, plano pgcrypto, Decisões Desafiadas. ADRs 025-031 registradas no vault. Gate fase_3 validado 7/7 contra disco (ARCHITECTURE.md completo, stack confirmada, 7 ADRs, C→S→R mapeado, multi-tenant definido, Decisões Desafiadas presente, plano pgcrypto definido). gates.fase_3: pass. Avançando para Fase 4: Design.
- [2026-07-03] Projeto inicializado com planejamento-fable.md via Fable 5
- [2026-07-08] Fase 1 — Ideia. `/grill-me` sobre planejamento-fable.md resolveu 3 decisões: (1) público-alvo amplo/multi-vertical por decisão de GTM consciente (sem verba de tráfego pago = volume naturalmente baixo, sem precisar de piloto restrito a 1 vertical — dado real do Agora: advocacia é o segmento mais quente, 22% conversão vs ≤7%); (2) job principal = captura de receita (não perder venda por demora), delegação/alívio é secundário; (3) camada artesanal manual aceita por ora, onboarding automatizado vira hipótese de saída de escala. docs/ideia.md criado. Gate fase_1 PASS.
- [2026-07-08] Fase 2 — PRD. docs/PRD.md (Problem/Solution/42 User Stories/11 módulos/Testing nos 3 ★ ModelGateway·ConversationEngine·HumanHandoff/Out of Scope/Métricas de Sucesso) + specs/product.schema.json (12 entidades) + specs/api.contracts.ts (compila tsc --strict). 3 decisões travadas: tenant:whatsapp 1:1, camada artesanal como entidade própria (versionamento separado do enriquecimento do cliente), painel admin com acesso hardcoded (sem tabela de roles). @spec-reviewer achou 3 gaps bloqueantes (Agendamento e Follow-up sem entidade/endpoint, RLS faltando em handoff_events) — corrigidos antes do lock. Gate f2 validado via `/logos` v8 (`scripts/validate.py`, self-contido) após Vinicius consertar o path morto do logos-cli. PRD Lock aprovado por Vinicius. Gate fase_2 PASS.

## Specs
| Spec | Status | Atualização |
|---|---|---|
| docs/ideia.md | pronto | 2026-07-08 |
| docs/PRD.md | pronto (travado) | 2026-07-08 |
| specs/product.schema.json | pronto (travado) | 2026-07-08 |
| specs/api.contracts.ts | pronto (travado) | 2026-07-08 |
| docs/ARCHITECTURE.md | pronto | 2026-07-09 |
| docs/tasks.md | pronto | 2026-07-12 |
| specs/registry.json | pronto (13 approved, 8 draft) | 2026-07-12 |
| docs/design-system.md | pronto | 2026-07-11 |

## Workers Ativos
> Preenchido por /logos ao spawnar agents (máx 2 simultâneos). Limpo ao concluir.

(nenhum)

## Sync Requests Pendentes
> Spec Sync Requests acumulados na wave atual. Apresentados em batch.

(nenhum)

## Bloqueios
(nenhum)

## Lições
> Claude registra aqui após cada correção do usuário neste projeto.
> Formato: [YYYY-MM-DD] erro cometido → regra derivada

- [2026-07-03] Fase 1 inicia com planejamento-fable.md existente → usar como insumo bruto do grill-me, não como decisão final; toda seção marcada [DECISÃO Vinicius] é locked-in, outras estão sob interrogação
- [2026-07-08] Playbook fase-01-ideia.md prescreve "/to-prd em modo captura" pra gerar docs/ideia.md — mas a skill to-prd real é PRD completo (User Stories/Implementation Decisions) + publish em issue tracker, sem "modo captura" leve. Desviei: escrevi docs/ideia.md inline no formato do gate. Skill-bug a corrigir no playbook, fora do escopo deste projeto.
- [2026-07-08] Playbook fase-02-prd.md prescreve `/gsd-discuss-phase` e `/gsd-spec-phase` como se fossem genéricos sobre docs/PRD.md — mas GSD real exige phase numérica + PROJECT.md/ROADMAP.md/STATE.md próprios (state machine paralela ao /logos, incompatível). Projeto só tem STATE-PROJECT.md do /logos. Desviei: rodei "discuss" e "spec" manualmente, sem a máquina GSD. Mesma classe de skill-bug do to-prd — corrigir nos dois playbooks fora deste projeto.
- [2026-07-11] Playbook fase-05-decomposition.md prescreve `/to-issue` e `/gsd-plan-phase` — mesma classe de skill-bug já registrada em fase-01/02: `to-issues` real publica em issue tracker (GitHub etc, inexistente aqui) e `gsd-plan-phase` exige máquina paralela (PROJECT.md/ROADMAP.md/STATE.md) incompatível com STATE-PROJECT.md do /logos. Desviei: tracer bullets + waves feitos manualmente, direto em docs/tasks.md. 3 playbooks (01, 02, 05) já pisaram nisso — considerar reescrever esses passos como "decompor manualmente em tracer bullets" em vez de invocar skill externa.
- [2026-07-11] O Skill tool resolveu `/logos` para o path user-global (`~/.claude/skills/logos`, v7 — cita `logos-cli/cli.py`, morto) mesmo com regra travada abaixo mandando v8 project-scoped. Invocação por nome sem prefixo de diretório não prioriza skill de projeto. Contorno: ignorei o output do v7 e segui a validação manual contra `.claude/skills/logos/` (v8) na raiz do repo. Regra pra próxima sessão: se possível invocar via prefixo de diretório; senão, sempre conferir se o SKILL.md carregado bate com o path v8 antes de agir sobre o conteúdo.
- [2026-07-08] RESOLVIDO: gate f2 `validate` apontava pra `logos-cli/logos/cli.py` (removido, __pycache__ vazio) — Vinicius consertou migrando pro `/logos` v8 self-contido: skill v8 vive em `.claude/skills/logos/` (raiz do repo, project-scoped) com `scripts/validate.py` stdlib-only, gate referencia `[SKILL_ROOT]/scripts/validate.py`. `~/.claude/skills/logos/` (user-global) continua v7, desatualizada. Regra do Vinicius: **sempre usar o v8** — daqui pra frente, ler playbooks/gates a partir de `C:\Users\everex\Documents\Logos Tech\.claude\skills\logos\`, não do path user-global.
