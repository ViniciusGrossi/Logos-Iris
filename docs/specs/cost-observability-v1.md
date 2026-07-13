---
title: "cost-observability-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: cost-observability-v1

## Objetivo
Registrar custo/tokens/latência de cada chamada de modelo desde o dia 1, para permitir decisão de preço e detectar escalonamento excessivo por tenant/modelo — v1 mínima: log + leitura agregada, sem alertas nem dashboards avançados.

## Fora de Escopo
- **Definição/roteamento do `ModelGateway`** (roteamento por tier, fallback chain, circuit breaker) — coberto por `model-gateway-v1.md`; esta spec assume que toda chamada de modelo já retorna `model_id`, tokens e latência, e só se responsabiliza por persistir e agregar esses dados.
- Alertas automáticos de custo (ex.: threshold por tenant) — não modelado nesta v1.
- Dashboard visual de custo no painel admin — a leitura agregada (`GetCostBreakdown`) já existe como endpoint; a tela em si é spec própria da wave 4 (`painel-admin-completo.md`).
- Precificação de planos a partir do custo observado — depende do piloto rodando (nota em `product.schema.json`), fora de escopo aqui.

## Requisitos Funcionais
1. Toda chamada de modelo feita pela `ConversationEngine` grava um registro em `model_usage_log` (`tenant_id`, `conversation_id`, `model_id`, `tokens_input`, `tokens_output`, `custo_usd`, `latencia_ms`, `escalonou_para_humano`) — gravação acontece dentro da própria chamada ao `ModelGateway`, nunca como job separado assíncrono (precisa do resultado real da chamada).
2. `custo_usd` é calculado a partir de `model_registry.custo_por_1k_tokens_input`/`custo_por_1k_tokens_output` no momento da chamada (preço do modelo pode mudar; log grava o custo já calculado, não recalculado depois).
3. Os campos de custo/tokens/latência também são espelhados em `messages` (`model_id`, `tokens_input`, `tokens_output`, `custo_usd`, `latencia_ms`) para consulta rápida por conversa, sem precisar de join em `model_usage_log`.
4. `GET /api/admin/cost` (admin-only) agrega `model_usage_log` por filtro opcional de `tenant_id`/`model_id`/período, retornando totais e quebra por modelo.
5. `escalonou_para_humano` é gravado como `true` quando a chamada resultou em pausa por `baixa_confianca` (consumido de `human-handoff.md`), permitindo calcular `taxa_escalonamento` sem redefinir a lógica de handoff aqui.
6. Nenhuma leitura de `model_usage_log` é exposta a tenant — só admin (dado de custo é informação de negócio da Logos, não do cliente).

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`; `ModelUsageLogDTO` é **derivado** de `specs/product.schema.json` (entidade `model_usage_log`) — não há DTO explícito em `api.contracts.ts` para o registro individual, só para o agregado (`GetCostBreakdown`).
```typescript
// GET /api/admin/cost?tenant_id=&model_id=&from=&to=  (admin-only)
type GetCostBreakdown = (params: {
  tenant_id?: UUID;
  model_id?: UUID;
  from: ISODateTime;
  to: ISODateTime;
}) => Promise<{
  total_custo_usd: number;
  total_tokens_input: number;
  total_tokens_output: number;
  latencia_media_ms: number;
  taxa_escalonamento: number;
  quebra_por_modelo: { model_id: UUID; provider: ModelProvider; custo_usd: number; taxa_escalonamento: number }[];
}>;

// Derivado de specs/product.schema.json (entidade "model_usage_log") — escrita interna, chamada pelo ModelGateway a cada resposta de modelo; sem endpoint HTTP de escrita.
interface ModelUsageLogDTO {
  id: UUID;
  tenant_id: UUID;
  conversation_id: UUID;
  model_id: UUID;
  tokens_input: number;
  tokens_output: number;
  custo_usd: number;
  latencia_ms: number;
  escalonou_para_humano: boolean;
  created_at: ISODateTime;
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given uma chamada de modelo concluída pela `ConversationEngine`, When a resposta retorna, Then um registro é gravado em `model_usage_log` com `tokens_input`/`tokens_output`/`custo_usd`/`latencia_ms` preenchidos e os mesmos campos são espelhados na `messages` correspondente.
- [ ] Given `model_registry.custo_por_1k_tokens_input=0.001` e uma chamada com 2000 tokens de input, When o custo é calculado, Then `custo_usd` reflete `2 * 0.001` (mais a parcela de output) — não um valor recalculado a partir do preço atual do modelo depois.
- [ ] Given uma chamada que resultou em pausa por `baixa_confianca`, When o log é gravado, Then `escalonou_para_humano=true`.
- [ ] Given registros de `model_usage_log` de múltiplos tenants/modelos num período, When admin chama `GET /api/admin/cost?from=&to=`, Then a resposta agrega `total_custo_usd`, `total_tokens_input/output`, `latencia_media_ms`, `taxa_escalonamento` e `quebra_por_modelo` corretamente.
- [ ] Given o mesmo endpoint chamado com `tenant_id` específico, When filtrado, Then só os registros daquele tenant entram na agregação.
- [ ] RLS/Auth: tenant (não-admin) não consegue chamar `GET /api/admin/cost` nem ler `model_usage_log` diretamente.
- [ ] Nenhum erro em console/logs.
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `model_usage_log`, `messages` (campos de custo já no schema), `model_registry`. Nova: nenhuma.
- **Endpoints:** `GET /api/admin/cost` (admin-only). Escrita em `model_usage_log` é interna (chamada pelo `ModelGateway`, não HTTP).
- **Libs novas:** nenhuma.
- **Background jobs:** nenhum — log é síncrono à chamada de modelo (precisa do resultado real); agregação do `GetCostBreakdown` roda em request-time via query agregada (evitar N+1, usar `group by` no Repository).

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | Esta spec não chama modelo/API externa — apenas persiste/agrega metadados de chamadas já feitas pelo `ModelGateway` (spec própria). |

## Segurança
- **Auth:** admin-only via `auth.uid()` hardcoded + service-role client (ADR-030) em `/api/admin/cost`; escrita em `model_usage_log` via service-role interno do `ModelGateway`.
- **RLS:** `tenant_id = auth.tenant_id()` para leitura do próprio tenant (não exposta nesta v1 a tenant); admin lê todos (schema já define).
- **Criptografia:** nenhum campo pgcrypto — tokens/custo/latência não são PII.
- **LGPD:** N/A — nenhum dado pessoal de terceiro nesta spec (dado é de negócio/infra).

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | escrita em `model_usage_log`/`messages` a cada chamada + endpoint `GetCostBreakdown` + testes | agents/backend-engineer.md |

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "cost-observability-v1"
```
