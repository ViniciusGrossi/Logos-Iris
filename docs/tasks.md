---
title: "Logos Iris — Decomposition (Fase 5)"
date: 2026-07-12
tags: [tasks, waves, decomposition]
---

# Tasks — Logos Iris

> Tracer bullets verticais (banco→backend→frontend→testes) derivados do PRD (42 stories / 11 módulos) +
> ARCHITECTURE.md (C→S→R, ADRs). Cada task ≤4h — quebradas onde a camada sozinha passaria disso.
> `Tipo`: AFK (implementa e mergeia sem humano) · HITL (pede decisão/review humana).
> Aprovado por Vinicius em 2026-07-12 (breakdown de waves — ver STATE-PROJECT.md).

## Wave 0 — Fundação (bloqueante para todas as waves seguintes)

| # | Task | Camada | Est. | Depende de | Tipo |
|---|---|---|---|---|---|
| 1.1 | Migration `001_extensions_pgcrypto_vault` | Banco | 1h | — | AFK |
| 1.2 | Migration `002_plans_tenants_tenant_members` + Custom Access Token Hook (tenant_id no JWT) | Banco | 3h | 1.1 | AFK |
| 1.3 | Migration `003_contacts` (telefone_hash HMAC, telefone_enc/nome_enc pgp_sym) + RLS base | Banco | 3h | 1.2 | AFK |
| 2.1 | `webhook_inbox` (tabela) + adapter Evolution (recebe, normaliza `fromMe`) | Backend | 4h | 1.3 | AFK |
| 2.2 | Auto-pausa por `fromMe` detectado (ADR-029) + teste de contrato do adapter | Backend | 3h | 2.1 | AFK |
| 3.1 | Fila por conversa: pgmq + advisory lock (ADR-028) | Backend | 4h | 2.1 | AFK |
| 3.2 | TenantRouter — resolve tenant_id a partir do número de destino | Backend | 2h | 3.1 | AFK |
| 4.1 | MessageDebouncer — agrupa mensagens picadas (janela de tempo configurável) | Backend | 4h | 3.2 | AFK |
| 5.1 | ModelGateway v1 — roteamento por tier, 1 provider/chamada, sem fallback chain | Backend | 4h | 1.3 | AFK |
| 5.2 | ModelGateway v1 — testes mockados na fronteira do provider (módulo ★) | Testes | 2h | 5.1 | AFK |
| 6.1 | ConversationEngine v1 — camada núcleo (código, imutável) | Backend | 3h | 5.1 | AFK |
| 6.2 | ConversationEngine v1 — camada persona (template por tipo de agente) + precedência núcleo>persona | Backend | 4h | 6.1 | AFK |
| 6.3 | ConversationEngine v1 — testes de determinismo/precedência (módulo ★, sem LLM real) | Testes | 3h | 6.2 | AFK |

**Specs desta wave:** `whatsapp-gateway.md` (2.1-2.2) · `tenant-router-queue.md` (3.1-3.2) · `message-debouncer.md` (4.1) · `model-gateway-v1.md` (5.1-5.2) · `conversation-engine-v1.md` (6.1-6.3). Migrations 1.1-1.3 não têm spec de feature própria — são pré-requisito direto da Fase 6 (Build Banco), documentadas em ARCHITECTURE.md.

## Wave 1 — Vendável cedo: Atendimento + Agendamento

| # | Task | Camada | Est. | Depende de | Tipo |
|---|---|---|---|---|---|
| 7.1 | Persona Atendimento — prompt + regras de resposta (Stories 1-4) | Backend | 4h | 6.3 | AFK |
| 7.2 | Persona Atendimento — testes de fluxo (pergunta→resposta→captura de intenção) | Testes | 3h | 7.1 | AFK |
| 8.1 | **Spec Sync Request:** migration `tenants.timezone` (gap ARCHITECTURE.md) | Banco | 1h | 1.2 | AFK |
| 8.2 | Persona Agendamento — marcação (Stories 9-11) | Backend | 4h | 7.1, 8.1 | AFK |
| 8.3 | Job confirmação véspera + resumo diário (pg_cron, usa `tenants.timezone`) | Backend | 4h | 8.2 | AFK |
| 9.1 | TenantKnowledgeBase v1 — campos guiados de enriquecimento estruturado | Banco+Backend | 4h | 1.3 | AFK |
| 9.2 | Endpoint de leitura/escrita do enriquecimento (RLS por tenant) | Backend | 3h | 9.1 | AFK |
| 10.1 | ContactMemory — resumos por contato (`resumo_enc`, pgcrypto) | Banco+Backend | 4h | 1.3 | AFK |
| 10.2 | Geração de resumo pós-conversa (background job, nunca no request) | Backend | 3h | 10.1 | AFK |
| 11.1 | HumanHandoff — 5 triggers (botão, fromMe, comando, pedido cliente, baixa confiança) | Backend | 4h | 6.3, 7.1 | HITL |
| 11.2 | Teste individual por trigger (5 testes, módulo ★) | Testes | 3h | 11.1 | HITL |
| 11.3 | Resume de pausa longa — confirmação nunca-silenciosa (review de UX) | Backend | 2h | 11.1 | HITL |
| 12.1 | Painel Cliente — Inbox real (liga protótipo Fase 4 a dados reais) | Frontend | 4h | 2.2, 3.2 | AFK |
| 12.2 | Painel Cliente — Dashboard real (métricas básicas) | Frontend | 3h | 12.1 | AFK |
| 12.3 | Ação pausar/retomar agente (endpoint + UI) | Backend+Frontend | 3h | 11.1, 12.1 | AFK |
| 13.1 | Feature Gating v1 — bloqueio por plano no Service (ADR-030) | Backend | 3h | 1.2 | AFK |
| 14.1 | CostObservability v1 — log de custo por chamada de modelo | Backend | 2h | 5.1 | AFK |

**Specs desta wave:** `persona-atendimento.md` (7.x) · `persona-agendamento.md` (8.x, com Spec Sync Request de timezone) · `knowledge-base-v1.md` (9.x) · `contact-memory.md` (10.x) · `human-handoff.md` (11.x) · `painel-cliente-v1.md` (12.x) · `feature-gating-v1.md` (13.x) · `cost-observability-v1.md` (14.x).

## Wave 2 — Vendas + SDR

| # | Task | Camada | Est. | Depende de | Tipo |
|---|---|---|---|---|---|
| 15.1 | Persona Vendas — prompt + regras (Stories 5-8) | Backend | 4h | 6.3 | AFK |
| 15.2 | Persona Vendas — testes de fluxo | Testes | 3h | 15.1 | AFK |
| 16.1 | Persona SDR — prompt + regras (Stories 12-13) | Backend | 4h | 6.3 | AFK |
| 16.2 | Persona SDR — testes de fluxo | Testes | 2h | 16.1 | AFK |

**Specs desta wave:** `persona-vendas.md` · `persona-sdr.md` (draft na spec batch da wave 2, não nesta rodada).

## Wave 3 — Camada artesanal + enriquecimento avançado

| # | Task | Camada | Est. | Depende de | Tipo |
|---|---|---|---|---|---|
| 17.1 | ConversationEngine — camada artesanal (3ª camada), `artisanal_layer_versions` | Backend | 4h | 6.3 | HITL |
| 17.2 | UI de edição da camada artesanal (Vinicius) | Frontend | 4h | 17.1 | HITL |
| 17.3 | Versionamento + rollback da camada artesanal | Backend | 3h | 17.1 | AFK |
| 18.1 | KnowledgeField "tom de resposta" — campo dedicado (sai de `dados_negocio` genérico) | Banco+Backend | 3h | 9.1 | AFK |
| 19.1 | **Spec Sync Request:** endpoint de upload de documento (Story 20) | Backend | 4h | 9.2 | HITL |
| 19.2 | Extração de documento — usa ModelGateway `task_type: extracao_documento` (já existe) | Backend | 3h | 19.1, 5.1 | AFK |
| 19.3 | Tela de revisão do dono antes de publicar no enriquecimento | Frontend | 4h | 19.2 | HITL |

**Specs desta wave:** `camada-artesanal.md` · `knowledge-field-tom-resposta.md` · `document-upload-review.md` (com Spec Sync Request pro `api.contracts.ts`).

## Wave 4 — Admin + Model Gateway completo + Billing

| # | Task | Camada | Est. | Depende de | Tipo |
|---|---|---|---|---|---|
| 20.1 | Painel Admin — lista de tenants real (protótipo Fase 4 → dados) | Frontend | 3h | 1.2 | AFK |
| 20.2 | Painel Admin — billing view + audit (Stories 30-34) | Backend+Frontend | 4h | 20.1 | AFK |
| 21.1 | ModelGateway completo — fallback chain multi-provider | Backend | 4h | 5.1 | AFK |
| 21.2 | Golden-set de qualidade (gate antes de promover provider) | Backend | 4h | 21.1 | AFK |
| 21.3 | Minimização de PII pro provedor chinês (ADR-025, tier básico only) | Backend | 3h | 21.1 | AFK |
| 22.1 | Precificação/planos completo — upgrade/downgrade (Stories 39-42) | Backend+Frontend | 4h | 13.1 | AFK |

**Specs desta wave:** `painel-admin-completo.md` · `model-gateway-completo.md` · `precificacao-planos.md` (draft na spec batch da wave 4).

## Resumo de dependência entre waves

```
Wave 0 (fundação) → Wave 1 (Atendimento+Agendamento, vendável cedo)
                  → Wave 2 (Vendas+SDR)                    [paralelo à 1, mesma base]
Wave 1 → Wave 3 (artesanal + enriquecimento avançado, inclui débitos do PRD)
Wave 0 → Wave 4 (Admin + Model Gateway completo + Billing) [paralelo, só depende da fundação]
```

## Escopo desta rodada de specs (Fase 5)
Specs completas (API Contract, Segurança, Tokens/APIs, Sub-Agents, Validação + TDD oracle) draftadas AGORA para **Wave 0 + Wave 1** (13 features — o que efetivamente entra em build nas Fases 6-7). Waves 2-4 ficam registradas em `specs/registry.json` com `status: draft`, sem spec detalhada ainda — batch de spec própria roda no início de cada wave (mesmo padrão SDD, spec perto do build, não anos antes). Risco de "construir demais antes de feedback real" (nomeado no PRD) fica mitigado assim: só uma wave é vendável e vira código de verdade agora.
