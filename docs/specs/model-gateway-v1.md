---
title: "model-gateway-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-integracoes"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: model-gateway-v1

## Objetivo
O sistema roteia cada chamada de IA (`triagem`, `conversa_principal`, `extracao_documento`, `embeddings`) para o modelo/provedor ativo de maior prioridade cadastrado para o tipo de tarefa e o tier do plano do tenant — um único provedor escolhido por chamada, sem ainda executar a cadeia de fallback dinâmica em runtime.

## Fora de Escopo
- **Fallback chain completo em runtime** (avançar automaticamente para o próximo provedor quando o atual falha/rate-limita, com timeout + circuit breaker acionado) — fica para spec futura de wave posterior. Nesta v1, `RouteModel` só escolhe estaticamente entre as linhas já marcadas `ativo` no registry; não reage a falha de chamada real.
- **Golden-set de avaliação de qualidade PT-BR** dos modelos chineses (ADR-025) — critério de aceite de um ADR formal, não desta spec.
- **Minimização de PII** antes de enviar payload a provider estrangeiro — mecanismo ainda não definido (Risco em aberto #3 do `ARCHITECTURE.md`); é responsabilidade do `ConversationEngineService` antes de chamar o provider escolhido, fora desta spec.
- **Medição agregada de custo/latência/taxa de escalonamento em produção** — `CostObservability` (módulo 11), spec própria. Esta spec só garante que a decisão de roteamento está correta.
- **CRUD completo / tela do painel admin de model registry** — esta spec cobre o Service de roteamento e os 2 endpoints já travados no contrato (list/update); a experiência de tela (UI) é fatia de frontend fora desta v1.
- **`model_circuit_state`** (estado closed/open/half_open do circuit breaker) — tabela já modelada em `ARCHITECTURE.md`, mas suas transições são comportamento de fallback dinâmico. Nesta v1, `RouteModel` não lê nem escreve `model_circuit_state`; só filtra por `model_registry.ativo`.

## Requisitos Funcionais
1. Dado `{ tenant_id, task_type, tier_do_plano }`, `RouteModel` retorna o modelo ativo de maior prioridade (`prioridade_fallback` mais baixo) cadastrado em `model_registry` para aquele `(task_type, tier)`.
2. Se o registro de maior prioridade estiver `ativo=false`, `RouteModel` resolve para o próximo registro ativo na ordem de `prioridade_fallback` — fallback estático de configuração (dado), não fallback dinâmico de runtime (comportamento).
3. Se nenhum modelo ativo existir para `(task_type, tier)`, `RouteModel` lança um erro explícito e tratável — nunca retorna um resultado inconsistente silenciosamente; o Service chamador decide o que fazer (ex.: `ConversationEngine` escala para humano).
4. `RouteModel` nunca retorna um provedor chinês (`glm`, `kimi`, `deepseek`, `minimax`) para `tier_do_plano='premium'` — invariante de ADR-025 validada na fronteira do próprio gateway, mesmo que o registry esteja mal configurado (defesa em profundidade).
5. O mesmo algoritmo de seleção é usado para qualquer `task_type` — o roteamento mais barato para `triagem` (Story 35) vem do dado cadastrado em `model_registry` (custo por linha), não de uma ramificação de código especial por tipo de tarefa.
6. `PUT /api/admin/model-registry/:id` permite ao admin ativar/desativar um modelo, mudar `prioridade_fallback` ou custo, com efeito imediato na próxima chamada de `RouteModel` (sem deploy — Stories 31/34).
7. `GET /api/admin/model-registry` lista todos os registros cadastrados (admin-only).

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`.

```typescript
type UUID = string;

type ModelProvider =
  | "glm"
  | "kimi"
  | "deepseek"
  | "minimax"
  | "nvidia_nim"
  | "claude"
  | "gpt4o"
  | "groq";

type ModelTaskType =
  | "triagem"
  | "conversa_principal"
  | "extracao_documento"
  | "embeddings";

interface ModelRouteRequest {
  tenant_id: UUID;
  task_type: ModelTaskType;
  tier_do_plano: "basico" | "premium";
}

interface ModelRouteResult {
  model_id: UUID;
  provider: ModelProvider;
  model_name: string;
  fallback_chain_position: number;
}

type RouteModel = (req: ModelRouteRequest) => Promise<ModelRouteResult>;

// GET /api/admin/model-registry  (admin-only)
type ListModelRegistry = () => Promise<ModelRegistryEntryDTO[]>;

interface ModelRegistryEntryDTO {
  id: UUID;
  provider: ModelProvider;
  model_name: string;
  task_type: ModelTaskType;
  tier: "basico" | "premium";
  prioridade_fallback: number;
  ativo: boolean;
  custo_por_1k_tokens_input: number;
  custo_por_1k_tokens_output: number;
}

// PUT /api/admin/model-registry/:id  (admin-only)
type UpdateModelRegistryEntry = (params: {
  id: UUID;
  patch: Partial<Pick<ModelRegistryEntryDTO, "ativo" | "prioridade_fallback" | "custo_por_1k_tokens_input" | "custo_por_1k_tokens_output">>;
}) => Promise<ModelRegistryEntryDTO>;
```

**Nota sobre `fallback_chain_position`:** o contrato já modela fallback (é campo travado, não pode ser alterado sem Spec Sync Request). Nesta v1, `RouteModel` sempre resolve para a posição de maior prioridade *ativa* — `fallback_chain_position` reflete a posição estática escolhida (posição 1 salvo quando a de posição 1 está inativa, ver Requisito 2). Avançar de posição em reação a uma falha de chamada em tempo real é escopo da spec de fallback completo (wave futura), não desta v1.

## Critérios de Aceite (= test cases do worker)
- [ ] Given `model_registry` com 2 linhas ativas para `(task_type='conversa_principal', tier='premium')` com `prioridade_fallback` 1 e 2, When `RouteModel` roda, Then retorna a linha de `prioridade_fallback=1` com `fallback_chain_position=1`
- [ ] Given a linha de `prioridade_fallback=1` está com `ativo=false`, When `RouteModel` roda para o mesmo `(task_type, tier)`, Then retorna a linha de `prioridade_fallback=2` (próxima ativa)
- [ ] Given nenhuma linha ativa existe para `(task_type='extracao_documento', tier='basico')`, When `RouteModel` roda, Then lança erro explícito (nunca retorna `model_id` nulo silenciosamente)
- [ ] Given uma linha com `provider` em (`glm`,`kimi`,`deepseek`,`minimax`) cadastrada por engano com `tier='premium'`, When `RouteModel` roda para `tier_do_plano='premium'`, Then essa linha é ignorada — nenhum provedor chinês é retornado para o tier premium (invariante ADR-025)
- [ ] Given `task_type='triagem'` para `tier_do_plano` básico ou premium, When `RouteModel` roda, Then usa o mesmo algoritmo genérico de seleção por `(task_type, tier)` — nenhuma ramificação de código especial por tipo de tarefa
- [ ] Given um admin autenticado, When chama `PUT /api/admin/model-registry/:id` com `{ ativo: false }`, Then a próxima chamada de `RouteModel` para aquele `(task_type, tier)` já reflete a mudança, sem deploy e sem cache stale
- [ ] RLS: tenant A não acessa dados de tenant B — `model_registry` é global (sem `tenant_id`) mas `GET/PUT /api/admin/model-registry*` só aceitam admin (checagem hardcoded, ADR-030); tenant autenticado comum recebe 403
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** `model_registry` (schema, existente). Não usa `model_circuit_state` nesta v1 (ver Fora de Escopo).
- **Endpoints:** `GET /api/admin/model-registry`, `PUT /api/admin/model-registry/:id` (ambos admin-only, já no contrato). `RouteModel` não é endpoint HTTP — chamado internamente por `ConversationEngineService`.
- **Libs novas:** nenhuma.
- **Background jobs:** não — a decisão de roteamento é síncrona e rápida (1 SELECT ordenado por `prioridade_fallback` filtrado por `ativo`).

**Gap encontrado (Spec Sync Request candidata):** `GET /api/admin/model-registry` retorna array sem parâmetros de paginação no contrato travado, o que diverge da regra global "paginação obrigatória em listagens" (`CLAUDE.md` do projeto). Dado que `model_registry` é uma tabela de configuração administrativa pequena e global (poucas dezenas de linhas, não cresce com uso/tenant), considero aceitável nesta v1 sem paginação — mas registro o gap explicitamente. Reabrir se a tabela crescer sem teto (ex.: múltiplos providers por task_type em escala muito maior).

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| (não aplicável nesta v1) | `RouteModel` não chama nenhum provider — só decide qual chamar | — | lido de `model_registry.custo_por_1k_tokens_input/output` (dado administrado, não chamada) | fallback dinâmico por falha real fica para wave futura |

## Segurança
- **Auth:** `RouteModel` é chamado internamente (service-role, sem HTTP); `/api/admin/model-registry*` exige checagem hardcoded de admin (`auth.uid()=VINICIUS_UUID`, ADR-030).
- **RLS:** `model_registry` é global sem `tenant_id`; RLS admin-only (schema).
- **Criptografia:** nenhuma — não há PII nesta tabela.
- **LGPD:** não aplicável diretamente a este módulo. Nota: quando o modelo roteado é provedor estrangeiro, a minimização de PII do payload enviado é responsabilidade do `ConversationEngineService` antes de chamar o provider (ADR-025) — `RouteModel` só decide QUAL modelo, nunca filtra o conteúdo enviado a ele.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | `RouteModel` + endpoints admin (list/update) + testes de seleção/invariantes | agents/backend-engineer.md |
| frontend-engineer | Não aplicável nesta v1 — tela de administração do registry fica fora de escopo (ver Fora de Escopo) | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "model-gateway-v1"
# Seed de model_registry fixture (linhas ativas/inativas, tiers, providers) em teste —
# sem chamar LLM real (mock na fronteira do provedor, conforme PRD)
```
