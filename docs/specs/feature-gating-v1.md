---
title: "feature-gating-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: feature-gating-v1

## Objetivo
Bloquear ações limitadas por plano no Service layer (nunca no Controller nem no Repository), refletir o plano/uso atual no painel cliente, e liberar admin (Vinicius) sem depender de tabela de roles — conforme ADR-030.

## Fora de Escopo
- Enforcement de cada feature listada em `PlanFeatures` (`voz_clonada_addon_disponivel`, `api_oficial_meta_addon_disponivel`, `auditoria_qualidade_incluida`, `max_personas_ativas`, `seats_painel`) — nesta v1 só o padrão `CheckFeatureGate` é estabelecido, com um caso concreto já contratado (`ScheduleFollowUp`) como referência de implementação. As demais checagens entram quando a ação correspondente tiver sua própria spec/endpoint (ex.: ativação de persona, convite de seat) — não inventar endpoint novo aqui.
- Upgrade/downgrade de plano, billing, Stripe — spec própria da wave 4 (`precificacao-planos.md`).
- Tabela de `admin_users`/roles — deliberadamente adiada (ADR-030); admin continua hardcoded por `auth.uid()`.

## Requisitos Funcionais
1. `FeatureGateService.CheckFeatureGate(tenant_id, feature)` lê `plans` (via `tenants.plano_id`) e `UsageSnapshot` atual, retornando `{ permitido, motivo? }` — chamado no Service, nunca no Controller.
2. `GET /api/plan/features` retorna `plano_nome`, `features` (o `PlanFeatures` completo do plano do tenant) e `uso_atual` (`UsageSnapshot`) para o painel refletir limites — este endpoint só **lê**, nunca aplica gate.
3. Toda Service que executa ação limitada por plano chama `CheckFeatureGate` antes de escrever no Repository (ex.: `ScheduleFollowUp` checa `follow_ups_automaticos_mes` antes de criar `follow_up`).
4. Se `CheckFeatureGate` retornar `permitido=false`, a ação é abortada e a resposta ao chamador inclui `{ bloqueado: true, motivo }` (padrão já usado em `ScheduleFollowUp`) — nunca lança erro genérico sem explicação.
5. Admin (Vinicius) contorna todo gate: Service checa `auth.uid() = VINICIUS_UUID` (hardcoded, ADR-030) + client service-role, e pula `CheckFeatureGate` inteiramente para rotas `/api/admin/*`.
6. Tenant só lê o próprio `PlanFeatures`/`UsageSnapshot` (RLS via claim JWT do Custom Access Token Hook, ADR-030) — nunca vê plano de outro tenant.

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`. `ScheduleFollowUp` é incluído aqui só como referência do padrão de gate já contratado (a spec da feature Follow-up em si pertence à wave 2, `persona-vendas.md`) — não redefinida, apenas citada.
```typescript
interface PlanFeatures {
  max_personas_ativas: number;
  roteador_invisivel_incluso: boolean;
  tier_modelo: "basico" | "premium";
  limite_mensagens_mes: number;
  retencao_memoria_dias: number;
  follow_ups_automaticos_mes: number;
  auditoria_qualidade_incluida: boolean;
  seats_painel: number;
  api_oficial_meta_addon_disponivel: boolean;
  voz_clonada_addon_disponivel: boolean;
}

// GET /api/plan/features  (painel cliente — reflete o gate, nunca aplica)
type GetCurrentPlanFeatures = (params: { tenant_id: UUID }) => Promise<{ plano_nome: string; features: PlanFeatures; uso_atual: UsageSnapshot }>;

interface UsageSnapshot {
  mensagens_mes_atual: number;
  personas_ativas_count: number;
  numeros_conectados: number;
}

// Checagem de gate roda no Service layer, chamada internamente antes de qualquer ação limitada por plano — não é endpoint HTTP.
type CheckFeatureGate = (params: { tenant_id: UUID; feature: keyof PlanFeatures }) => Promise<{ permitido: boolean; motivo?: string }>;

// Referência do padrão já contratado (spec própria em wave 2 — citada aqui só como exemplo de uso do gate):
// type ScheduleFollowUp = (params: {...}) => Promise<FollowUpDTO | { bloqueado: true; motivo: string }>;
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given um tenant no plano com `follow_ups_automaticos_mes=5` e 5 follow-ups já criados no mês, When `CheckFeatureGate(tenant_id, "follow_ups_automaticos_mes")` é chamado, Then retorna `{ permitido: false, motivo: "..." }` e a Service de follow-up aborta antes do Repository.
- [ ] Given o mesmo tenant com 3 follow-ups no mês, When `CheckFeatureGate` é chamado, Then retorna `{ permitido: true }`.
- [ ] Given um tenant autenticado, When `GET /api/plan/features` é chamado, Then retorna `plano_nome`, `features` completo do plano e `uso_atual` calculado — sem aplicar nenhum bloqueio (rota só leitura).
- [ ] Given uma chamada de rota `/api/admin/*` com `auth.uid() = VINICIUS_UUID`, When qualquer ação limitada por plano é executada, Then `CheckFeatureGate` é pulado inteiramente (bypass hardcoded).
- [ ] Given uma chamada de rota `/api/admin/*` com `auth.uid()` diferente do admin hardcoded, When a rota é acessada, Then o acesso é negado (não é tratado como admin).
- [ ] RLS: tenant A não lê `PlanFeatures`/`UsageSnapshot` de tenant B (`GetCurrentPlanFeatures` retorna erro/vazio).
- [ ] Nenhum erro em console/logs.
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `plans`, `tenants` (`plano_id`). Nova: nenhuma.
- **Endpoints:** `GET /api/plan/features`. `CheckFeatureGate` não é HTTP — é chamado internamente por outras Services.
- **Libs novas:** nenhuma.
- **Background jobs:** nenhum — `UsageSnapshot` é calculado em request-time via agregação (`count` em `messages`/`conversations`/`follow_ups` do mês corrente), sem necessidade de snapshot pré-computado nesta v1.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | Feature Gating não chama modelo/API externa — é uma checagem interna de dados já persistidos (`plans`, `tenants`, contadores de uso). |

## Segurança
- **Auth:** JWT tenant obrigatório em `/api/plan/features`; admin via `auth.uid()` hardcoded + service-role client nas rotas `/api/admin/*` (ADR-030).
- **RLS:** `tenant_id = claim` do Custom Access Token Hook (`app_metadata.tenant_id`) em `plans`/`tenants`; leitura de `plans` liberada a qualquer tenant autenticado (para comparar upgrade), escrita admin-only.
- **Criptografia:** nenhum campo pgcrypto — `PlanFeatures`/`UsageSnapshot` são dados de configuração/contagem, não PII.
- **LGPD:** N/A — nenhum dado pessoal de terceiro nesta spec.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | `FeatureGateService.CheckFeatureGate` + endpoint `GetCurrentPlanFeatures` + bypass admin hardcoded + testes | agents/backend-engineer.md |

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "feature-gating-v1"
```
