---
title: "Logos Iris — State of Project"
date: 2026-07-08
# ════════════════════════════════════════════════════
# MÁQUINA — lido por /logos e hooks. Não renomear campos.
# ════════════════════════════════════════════════════
fase_atual: "3"
etapa_atual: "Arquitetura"
# produto_tipo: saas-premium | dashboard | landing | mvp
produto_tipo: "saas-premium"
proximo_passo: "/logos — Fase 3: ler memoria/learnings.md → karpathy-guidelines → @arquiteto-sistemas (schema/camadas a partir de docs/PRD.md + specs/api.contracts.ts) → docs/ARCHITECTURE.md, com ADR formal do Model Gateway multi-provider (GLM/Kimi/DeepSeek/MiniMax/NVIDIA) e ADR de retenção/LGPD"
# fases_skipped: preenchido pelo init conforme produto_tipo
fases_skipped: []
# gates: ex { fase_1: pass, fase_2: pass }  ·  features: ex { auth: { spec: approved, built: true } }
gates: { fase_1: "pass", fase_2: "pass" }
features: {}
# overrides: ex [{ gate: "sdd-auth", motivo: "...", data: "..." }]
overrides: []
# ════════════════════════════════════════════════════
# HUMANO
# ════════════════════════════════════════════════════
# status: 🟢 Ativo | 🟡 Novo/Pausa | 🔴 Bloqueado
status: "🟡 Novo"
tags: [status, roadmap]
---

# ESTADO — Logos Iris

> Driver único do projeto. A skill `/logos` lê o frontmatter para rotear
> e atualiza este arquivo ao fim de cada etapa. Editar à mão só o corpo.

## Em Andamento
- [ ] Fase 3: Arquitetura — decisões técnicas + ADRs antes de código

## Concluído
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
| docs/ARCHITECTURE.md | pendente | — |
| specs/registry.json | pendente | — |
| docs/design-system.md | pendente | — |

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
- [2026-07-08] RESOLVIDO: gate f2 `validate` apontava pra `logos-cli/logos/cli.py` (removido, __pycache__ vazio) — Vinicius consertou migrando pro `/logos` v8 self-contido: skill v8 vive em `.claude/skills/logos/` (raiz do repo, project-scoped) com `scripts/validate.py` stdlib-only, gate referencia `[SKILL_ROOT]/scripts/validate.py`. `~/.claude/skills/logos/` (user-global) continua v7, desatualizada. Regra do Vinicius: **sempre usar o v8** — daqui pra frente, ler playbooks/gates a partir de `C:\Users\everex\Documents\Logos Tech\.claude\skills\logos\`, não do path user-global.
