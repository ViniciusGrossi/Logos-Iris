---
title: "Logos Iris — State of Project"
date: 2026-08-04
# ════════════════════════════════════════════════════
# MÁQUINA — lido por /logos e hooks. Não renomear campos.
# ════════════════════════════════════════════════════
fase_atual: "7"
etapa_atual: "Build Backend — wave 0"
# produto_tipo: saas-premium | dashboard | landing | mvp
produto_tipo: "saas-premium"
proximo_passo: "/logos parallel — Fase 7: wave 0 (whatsapp-gateway, tenant-router-queue, message-debouncer, model-gateway-v1, conversation-engine-v1), 2 backend-engineer por vez, worktree por feature"
# fases_skipped: preenchido pelo init conforme produto_tipo
fases_skipped: []
# gates: ex { fase_1: pass, fase_2: pass }  ·  features: ex { auth: { spec: approved, built: true } }
gates: { fase_1: "pass", fase_2: "pass", fase_3: "pass", fase_4: "pass", fase_5: "pass", fase_6: "pass" }
features: {
  whatsapp-gateway: { spec: "approved", wave: 0, built: false },
  tenant-router-queue: { spec: "approved", wave: 0, built: false },
  message-debouncer: { spec: "approved", wave: 0, built: false },
  model-gateway-v1: { spec: "approved", wave: 0, built: true, reviewed: true },
  conversation-engine-v1: { spec: "approved", wave: 0, built: true, reviewed: true },
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
- [ ] Fase 7: Build Backend — wave 0. `/logos parallel` dispatchado 2026-08-04.
  - `model-gateway-v1`: ✅ COMPLETO. Worker `backend-engineer` (16/16 testes) → merge `--no-ff` em master (sem conflito) → `npm install` + suite re-rodada 16/16 verde → `spec-reviewer` (agentId a8bc8d284cb7f4c65) auditou independente (rodou testes e `tsc --noEmit` de novo, não confiou no self-report): **"Merge liberado"**, zero drift spec/contrato/implementação, camadas C→S→R respeitadas, zero `any`. Único gap não-bloqueante: `ModelRegistryQueryError` (falha de driver, 502) sem teste direto — aceito, registrado abaixo. `registry.json`: `built: true`, `reviewed: true`.
  - `whatsapp-gateway`: worker `backend-engineer` ainda rodando (agentId a00939d40c4f08cd3) — único worker ativo agora.
  - `conversation-engine-v1`: ✅ COMPLETO (build+review). Worker entregou só `compilePrompt` (camadas 1-2 do prompt 4-camadas, ADR-027) — SEM Controller/route.ts e SEM consumir `model-gateway.service.ts`. `spec-reviewer` (a52d9c78881de9af3) confirmou linha a linha contra `docs/specs/conversation-engine-v1.md`: seção "Restrições Técnicas" diz literalmente "nenhum HTTP — função interna" e seção "Fora de Escopo" exclui chamada real ao ModelGateway nesta v1 — os 2 desvios são spec-driven, não corte de escopo disfarçado. Verificação independente: 7/7 testes, `tsc`/`eslint` limpos, zero `any`, zero PII no prompt. **Merge liberado.** Merge `--no-ff` + suite 23/23 verde. `registry.json` e frontmatter `features:` sincronizados: `built: true`, `reviewed: true`.
  - Slot livre (cap 2, 1 ativo) mas nenhuma feature nova pronta pra dispatch: as 3 restantes da wave 0 (`tenant-router-queue`, `message-debouncer`) seguem bloqueadas até `whatsapp-gateway` mergear.
  - Nota de cobertura (não bloqueante, não é Sync Request): `ModelRegistryQueryError` em `model-registry.repository.ts` (path de falha do client Supabase) sem teste — mockar client Supabase pra cobertura 4/4 se algum dia doer; achado do `spec-reviewer`, não corrigido agora por não ser gap de spec/contrato.

## Concluído
- [2026-08-04] Fase 6 — Build Banco. Worker `dba` retomado (mesmo agent, `SendMessage` — não respawn) após reconexão do MCP Supabase: 13 migrations + seed aplicadas no projeto real (`nqubjiosnlaatxxamiut`, schema `iris`+`iris_private`), pgTAP 32/32 verde. Review adversarial `@revisor-codigo` achou 1 CRÍTICO real (`service_role` sem nenhum GRANT de tabela em `iris` — `BYPASSRLS` não substitui `GRANT`; pgTAP tinha passado porque rodou como owner, mascarando o gap) + 4 baratos (3 índices FK faltando, soft-delete vazando em 3 policies de SELECT, `updated_at`+trigger faltando em 3 tabelas, `anon` com USAGE sobrando). Devolvido ao mesmo worker dba via SendMessage (protocolo: continuar agent existente). Migration `0014` corrigiu os 5 + nova suite pgTAP `04_service_role_grants.sql` provando o fix (INSERT/SELECT como `service_role` puro em `messages`/`webhook_inbox`). Suite final: 36/36, zero `not ok`. Advisors sem regressão nova. 1 gap arquitetural aceito e registrado como Sync Request (RLS ausente nas 26 partições filhas de `messages`/`model_usage_log` — `ensure_monthly_partition()` não herda RLS; mitigado por `iris` não estar em Exposed Schemas). 1 Sync Request encaminhada pra fase 7 (JSONB `conversation_state.state`/`conversation_signals.payload` fora do plano pgcrypto — engine não pode gravar PII bruta neles). gates.fase_6: pass. Avançando para Fase 7: Build Backend.
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

- `backend-engineer` · feature `whatsapp-gateway` · worktree isolado · agentId a00939d40c4f08cd3 · dispatch 2026-08-04

## Sync Requests Pendentes
> Spec Sync Requests acumulados na wave atual. Apresentados em batch.

- Dashboard Supabase: adicionar schema `iris` em Settings → API → Exposed Schemas (ação manual fora do write-scope do worker dba, necessária antes de `supabase-js .schema('iris')` funcionar em Fase 7+)
- [2026-08-04] RLS ausente nas 26 tabelas-partição filhas de `iris.messages`/`iris.model_usage_log` (13 cada, `_2026_08`→`_2027_08`): `iris_private.ensure_monthly_partition()` (0006/0012) cria a partição via `CREATE TABLE ... PARTITION OF` mas não roda `ENABLE ROW LEVEL SECURITY`/`FORCE ROW LEVEL SECURITY` nela — só a tabela-mãe particionada tem RLS+policies (confirmado via `pg_class.relrowsecurity`). Mitigado hoje por `iris` não estar em Exposed Schemas (sem acesso PostgREST), mas é gap de defesa em profundidade: acesso direto via SQL/service role endereçando a partição pelo nome ignora RLS. Decisão pendente: patchar `ensure_monthly_partition()` pra herdar RLS nas partições novas (afeta 0006 e 0012 simultaneamente) — não corrigido unilateralmente pelo worker dba (fora do mandato "executar, não redesenhar").
- [2026-08-04] Fase 7 (backend/engine): `iris.conversation_state.state` e `iris.conversation_signals.payload` são JSONB fora do plano pgcrypto — se o engine gravar slots com PII bruta (nome, telefone, CPF extraído de conversa) isso persiste em plaintext. Achado do `@revisor-codigo` na auditoria da fase 6 (schema não muda agora — decisão de comportamento de aplicação). Cobrar no build da engine: nunca persistir PII bruta nesses campos; se necessário, referenciar `contacts.*_enc`/`*_hash` em vez de copiar o dado.

## Bloqueios
(nenhum — bloqueio de 2026-07-15 resolvido em 2026-08-04: MCP Supabase reconectado nesta sessão, opção (a) do desbloqueio)

## Lições
> Claude registra aqui após cada correção do usuário neste projeto.
> Formato: [YYYY-MM-DD] erro cometido → regra derivada

- [2026-08-04] Playbook fase-07-backend.md prescreve `/review-against-spec` como passo pós-merge — mas essa skill tem `disable-model-invocation` (só usuário digita, `Skill` tool recusa chamada minha). Mesma classe dos skill-bugs de fase-01/02/05 (to-prd, gsd-*), já registrados acima. Desviei: usei o subagent `spec-reviewer` (mesmo propósito — drift spec vs código) no lugar. Corrigir playbook fora deste projeto: trocar `/review-against-spec` por dispatch de `spec-reviewer`.
- [2026-08-04] Worktree de worker não roda `npm install` no repo principal — `package.json`/`package-lock.json` mergeiam limpo mas `node_modules` do working dir principal fica sem os deps novos (vitest, zod, @supabase/*) até `npm install` manual. Regra: sempre `npm install` antes de re-rodar suite pós-merge de feature backend, senão o "re-run" silenciosamente falha (exit 1, zero output) e parece erro de config.

- [2026-08-04] pgTAP rodando como owner (`postgres`) mascara ausência de GRANT pra `service_role` — `BYPASSRLS` faz a policy RLS não bloquear, mas não supre a falta de `GRANT` de tabela; o caminho de produção real (webhook/engine autenticando como `service_role`) só quebra em runtime, não no teste. Regra: toda suite pgTAP de schema multi-role precisa de pelo menos 1 teste rodando `set local role service_role` (ou o role de menor privilégio real da aplicação), não só `authenticated`/owner.
- [2026-08-04] Worker de execução (dba aplicando migrations já escritas) que precisa reconstruir SQL de memória em vez de ler o arquivo literal introduz divergência (ver 0012: colunas erradas na 1ª tentativa). Regra: worker executor deve sempre citar o Read do arquivo antes de montar o `query` do `apply_migration` — nunca reconstruir de memória mesmo quando "óbvio".
- [2026-07-03] Fase 1 inicia com planejamento-fable.md existente → usar como insumo bruto do grill-me, não como decisão final; toda seção marcada [DECISÃO Vinicius] é locked-in, outras estão sob interrogação
- [2026-07-08] Playbook fase-01-ideia.md prescreve "/to-prd em modo captura" pra gerar docs/ideia.md — mas a skill to-prd real é PRD completo (User Stories/Implementation Decisions) + publish em issue tracker, sem "modo captura" leve. Desviei: escrevi docs/ideia.md inline no formato do gate. Skill-bug a corrigir no playbook, fora do escopo deste projeto.
- [2026-07-08] Playbook fase-02-prd.md prescreve `/gsd-discuss-phase` e `/gsd-spec-phase` como se fossem genéricos sobre docs/PRD.md — mas GSD real exige phase numérica + PROJECT.md/ROADMAP.md/STATE.md próprios (state machine paralela ao /logos, incompatível). Projeto só tem STATE-PROJECT.md do /logos. Desviei: rodei "discuss" e "spec" manualmente, sem a máquina GSD. Mesma classe de skill-bug do to-prd — corrigir nos dois playbooks fora deste projeto.
- [2026-07-11] Playbook fase-05-decomposition.md prescreve `/to-issue` e `/gsd-plan-phase` — mesma classe de skill-bug já registrada em fase-01/02: `to-issues` real publica em issue tracker (GitHub etc, inexistente aqui) e `gsd-plan-phase` exige máquina paralela (PROJECT.md/ROADMAP.md/STATE.md) incompatível com STATE-PROJECT.md do /logos. Desviei: tracer bullets + waves feitos manualmente, direto em docs/tasks.md. 3 playbooks (01, 02, 05) já pisaram nisso — considerar reescrever esses passos como "decompor manualmente em tracer bullets" em vez de invocar skill externa.
- [2026-07-11] O Skill tool resolveu `/logos` para o path user-global (`~/.claude/skills/logos`, v7 — cita `logos-cli/cli.py`, morto) mesmo com regra travada abaixo mandando v8 project-scoped. Invocação por nome sem prefixo de diretório não prioriza skill de projeto. Contorno: ignorei o output do v7 e segui a validação manual contra `.claude/skills/logos/` (v8) na raiz do repo. Regra pra próxima sessão: se possível invocar via prefixo de diretório; senão, sempre conferir se o SKILL.md carregado bate com o path v8 antes de agir sobre o conteúdo.
- [2026-07-15] Não existe projeto Supabase dedicado ao Logos Iris — instância compartilhada (`nqubjiosnlaatxxamiut`, "Teste de projetos") com 1 schema Postgres por produto (`delphi`, `logos_platform`, `logos_polis`, `concurso`, `padaria`, `paideia`, `Mens-Sana`, `Logus_Tech_Oficinas`). dba decidiu seguir o padrão: schema `iris` (tabelas) + `iris_private` (funções pgcrypto/SECURITY DEFINER) em vez do `private` genérico do ARCHITECTURE.md — evita colisão de nome entre produtos na mesma instância. Repassar essa convenção pro worker quando respawnar.
- [2026-07-08] RESOLVIDO: gate f2 `validate` apontava pra `logos-cli/logos/cli.py` (removido, __pycache__ vazio) — Vinicius consertou migrando pro `/logos` v8 self-contido: skill v8 vive em `.claude/skills/logos/` (raiz do repo, project-scoped) com `scripts/validate.py` stdlib-only, gate referencia `[SKILL_ROOT]/scripts/validate.py`. `~/.claude/skills/logos/` (user-global) continua v7, desatualizada. Regra do Vinicius: **sempre usar o v8** — daqui pra frente, ler playbooks/gates a partir de `C:\Users\everex\Documents\Logos Tech\.claude\skills\logos\`, não do path user-global.
