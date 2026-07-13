# Logos Iris — Architecture

> Fase 3 (`/logos`). Insumos: `docs/PRD.md` (travado, F2) + `specs/product.schema.json` (travado) + `specs/api.contracts.ts` (travado) + `04-Projetos/02-Knowledge/decisoes.md` (25 ADRs existentes). Gerado 2026-07-09.

---

## Stack confirmada

**Stack padrão Logos Tech mantida** (ADR-025 e ADR-031 divergem pontualmente com justificativa):

| Camada | Tecnologia | Observação |
|---|---|---|
| Frontend (painéis) | Next.js 15 App Router + Tailwind v4 + Shadcn UI + Lucide | Painel Cliente + Painel Admin como áreas separadas |
| Database | Supabase (PostgreSQL 15 + pgvector + pgmq) | RLS ativo em toda tabela tenant-scoped |
| Auth | Supabase Auth (JWT) | Custom Access Token Hook p/ injetar `tenant_id` + `is_admin` |
| Backend IA | Supabase Edge Functions (Deno) | Caminho quente: webhook → engine → resposta |
| Automação | N8N + Evolution API (WhatsApp) | Só ops: aquecimento de número, alertas. Fora do caminho quente |
| Embeddings | Supabase Edge Functions (Deno) | ModelGateway com provider dedicado |
| Deploy | Vercel (painéis) + Supabase (banco + edge) | Sem worker externo — ver ADR-031 |

**Divergências documentadas do stack padrão:**
- **ADR-025 — Model Gateway multi-provider:** estende ADR-019 (Strategy Pattern IA) com provedores chineses (GLM/Kimi/DeepSeek/MiniMax) + NVIDIA. Divergência justificada: custo-benefício em triagem e tier básico, onde Claude/GPT-4o são caros demais. Provedor chinês NUNCA no tier premium. Minimização de PII antes de enviar a provider estrangeiro.
- **ADR-031 — Engine off-serverless ADIADO:** stack padrão diz FastAPI para backend IA. Decisão: começar com Edge Function (Deno) + pgmq. FastAPI (worker persistente) vira upgrade path documentado, acionado só se extração de documento ou batch de embeddings provar que estoura o envelope de 400s/2s-CPU.

---

## Camadas: Controller → Service → Repository

C→S→R obrigatório (Iris é multi-tenant com auth; ADR-014/011/013 NÃO se aplicam). Controller só (des)serializa + valida Zod + extrai `tenant_id` do JWT. Service tem toda a lógica de negócio + gate de plano. Repository é único acesso a banco, recebe `tenantId` obrigatório, retorna DTOs.

| Domínio | Controller | Service | Repository |
|---|---|---|---|
| **Gateway** | `POST /api/webhooks/whatsapp/:provider` | `WhatsAppGatewayService` (adapters Evolution→OpenWA→Cloud, normaliza `fromMe`); `TenantRouterService` (resolve tenant por número); `MessageDebouncerService` | `ContactRepo`, `ConversationRepo`, `MessageRepo`, `WebhookInboxRepo`, `WhatsAppConnectionRepo` |
| **Conversa** | `/api/conversations*`, `/api/pause`, `/api/resume` | `ConversationEngineService` (compila prompt 4 camadas → ModelGateway → tools); `ConversationStateService`; `ContactMemoryService` (resumo periódico) | `ConversationRepo`, `MessageRepo`, `ConversationStateRepo`, `ContactMemoryRepo`, `KnowledgeChunkRepo` |
| **Handoff** | `/api/pause`, `/api/resume` | `HumanHandoffService` (5 gatilhos; retomada pós-pausa-longa nunca silenciosa) | `HandoffEventRepo`, `ConversationRepo` |
| **Knowledge** | `/api/knowledge-base*`, `/api/playground`, `/api/artisanal-layer/summary` | `KnowledgeBaseService` (draft/publish, lint contradição, versionamento/rollback); `ArtisanalLayerService` (admin-only); `EmbeddingService` | `KnowledgeEntryRepo`, `ArtisanalLayerRepo`, `KnowledgeChunkRepo` |
| **Model** | `/api/admin/model-registry*` | `ModelGatewayService` (RouteModel, circuit breaker, fallback chain, timeout); `CostObservabilityService` | `ModelRegistryRepo`, `ModelCircuitStateRepo`, `ModelUsageLogRepo` |
| **Agendamento** | `/api/appointments*`, `/api/follow-ups*` | `AppointmentService`, `FollowUpService` (gate `follow_ups_automaticos_mes` antes de criar) | `AppointmentRepo`, `FollowUpRepo` |
| **Billing** | `/api/plan/features` | `FeatureGateService` (CheckFeatureGate — chamado por todos os Services antes de ação limitada; painel cliente só reflete o resultado) | `PlanRepo`, `UsageRepo` |
| **Admin** | `/api/admin/tenants*`, `/api/admin/cost` | `AdminService` (checagem hardcoded `auth.uid()=VINICIUS_UUID` → service-role client; ignora gate de plano) | `TenantRepo`, `TenantMemberRepo` (todos via service role) |
| **Dashboard** | `/api/dashboard/summary` | `DailySummaryService` (lê `conversation_signals` + agregações) | `ConversationSignalRepo`, `ModelUsageLogRepo` |

**Background jobs (nunca no request/response):** extração de documento, embeddings, resumo de memória, follow-up, confirmação de véspera, resumo diário, purge de retenção. Todos via Edge Function + pgmq (ver Pontos de Integração).

---

## Modelagem de dados

### 1.0 Fundamentos transversais

**Resolução de tenant no RLS:** o schema travado em `product.schema.json` referencia `auth.tenant_id()` — mas essa função não existe. Resolvido com **Custom Access Token Hook** do Supabase Auth: no mint do JWT, o hook lê `tenant_members` e injeta `app_metadata.tenant_id` + `app_metadata.is_admin` como claims. RLS usa o claim direto:

```sql
-- expressão RLS padrão de toda tabela tenant-scoped
using ( tenant_id = (select nullif(auth.jwt()->'app_metadata'->>'tenant_id','')::uuid) )
```

Toda tabela tenant-scoped: `enable row level security` + `force row level security` + índice em `(tenant_id)`.

**Admin (Vinicius) nunca passa por RLS de tenant.** O app Admin usa service_role client no Service layer, atrás de checagem hardcoded `auth.uid() = <VINICIUS_UUID>`. Service role bypassa RLS por definição.

**Tabela aditiva `tenant_members`** (estende schema, não altera contrato):
```
id uuid pk, tenant_id uuid fk not null, user_id uuid fk->auth.users not null,
role text check(owner|seat), created_at, updated_at, deleted_at
unique(tenant_id, user_id)
RLS: tenant_id = claim; INSERT/DELETE só owner do tenant ou admin.
```

### 1.2 Plans, tenants, conexão WhatsApp

**`plans`** (global, sem tenant_id). Colunas achatadas (não EAV): `max_personas_ativas`, `limite_mensagens_mes`, `retencao_memoria_dias`, `follow_ups_automaticos_mes`, `auditoria_qualidade_incluida`, `seats_painel`, `api_oficial_meta_addon_disponivel`, `voz_clonada_addon_disponivel`, `tier_modelo` (basico/premium). EAV só quando admin precisar criar feature sem deploy.
`RLS: SELECT authenticated; INSERT/UPDATE admin-only.`

**`tenants`** (schema, mantido). `whatsapp_number` unique (1:1 travado), `plano_id` fk, `personas_ativas[]`.
`Índices: unique(whatsapp_number), (plano_id), parcial (status) where deleted_at is null.`

**`whatsapp_connections`** (aditiva, 1:1 com tenant). Token/credentials são segredos — **ADR-018 (RLS ON sem policy → service-role-only)**:
```
tenant_id uuid pk fk, provider enum, instance_id text,
credentials_ref text  -- ref Supabase Vault, nunca segredo em claro
session_status enum, updated_at
RLS: ON, SEM policy. Só service role (adapters no worker) lê.
```

### 1.3 Contatos, conversas, mensagens

**`contacts`** — com pgcrypto (ver Seção 5):
```
id uuid pk, tenant_id uuid fk not null,
telefone_hash bytea not null,        -- HMAC-SHA256 p/ lookup no webhook
telefone_enc bytea not null,         -- pgp_sym_encrypt p/ leitura
nome_enc bytea null,
created_at, updated_at, deleted_at
unique(tenant_id, telefone_hash)
Índices: unique(tenant_id, telefone_hash), (tenant_id).
RLS: tenant_id = claim.
```

**`conversations`** (schema). `status`, `pausada_ate`.
`Índices: (tenant_id, status) parcial where status='ativa', (contact_id), (tenant_id, updated_at desc).`

**`conversation_state`** (aditiva) — horizonte curto, 1:1 com conversa, expira:
```
conversation_id uuid pk fk, tenant_id uuid, state jsonb (slots/intent/pending_tool),
debounce_until timestamptz null, expires_at timestamptz not null, updated_at
Índices: (debounce_until) parcial where debounce_until is not null, (expires_at).
RLS: tenant_id=claim (leitura), escrita service-role.
```

**`messages`** — PARTICIONADA por RANGE(created_at) mensal. Cresce sem teto, retenção LGPD por drop partition. Aditivos: `tenant_id` denormalizado (RLS sem join), `provider_message_id text` (idempotência).
```sql
create table messages (
  id uuid, tenant_id uuid not null, conversation_id uuid not null,
  provider_message_id text, conteudo_enc bytea not null,
  direcao text not null, tipo_midia text not null default 'texto',
  from_me_detectado boolean not null default false,
  model_id uuid, tokens_input int, tokens_output int, custo_usd numeric(10,6), latencia_ms int,
  created_at timestamptz not null default now(),
  primary key (id, created_at)
) partition by range (created_at);
create index messages_conv_created_idx on messages (conversation_id, created_at desc);
create index messages_tenant_idx on messages (tenant_id);
```
**Idempotência** não é por unique em messages (partição impede). Resolvido em `webhook_inbox` (tabela separada, não-particionada, pk(tenant_id, provider_message_id), TTL 7d).

**`contact_memory_summaries`** (schema, `resumo_enc`). Horizonte longo. `expira_em` derivado de `plans.retencao_memoria_dias`.
`Índices: (contact_id, periodo_fim desc), (expira_em), (tenant_id).`

**`handoff_events`** (schema + aditivo `tenant_id`).
`Índices: (conversation_id, acionado_em desc), (tenant_id).`

**`appointments`** (schema).
`Índices: (tenant_id, horario), (contact_id), (conversation_id), parcial (horario) where status in ('agendado','confirmado').`

**`follow_ups`** (schema).
`Índices: parcial (agendado_para) where status='pendente', (tenant_id, created_at), (conversation_id).`

**`conversation_signals`** (aditiva — gap descoberto: `GetDailySummary.orcamentos_gerados` e `leads_quentes` não têm backing):
```
id uuid, tenant_id uuid, conversation_id uuid,
tipo enum(orcamento, lead_quente, intencao_agendamento), payload jsonb, created_at
Índices: (tenant_id, created_at), (conversation_id). RLS: tenant_id=claim.
```

### 1.4 Knowledge (2 entidades versionadas + chunks vetoriais)

**`knowledge_base_entries`** (schema, enriquecimento do cliente, versionado). `conteudo jsonb`, `status enum(rascunho/publicado/historico)`, `campo enum(catalogo, faq, politicas, horarios, saudacao, nome_agente, dados_negocio)`.
`Índices: unique(tenant_id, campo, versao), parcial (tenant_id, campo) where status='publicado'.`

**`artisanal_layer_versions`** (schema, entidade SEPARADA, autor = admin Logos). `conteudo text`, versionado.
`RLS: SELECT (resumo) para tenant_id=claim; INSERT/UPDATE admin-only (service-role).`

**`knowledge_chunks`** (pgvector) — **UMA tabela com `tenant_id` + HNSW filtrado** (não schema-por-tenant):
```sql
create table knowledge_chunks (
  id uuid pk, tenant_id uuid not null,
  source_type text check (source_type in ('tenant_knowledge','artisanal','contact_memory')),
  source_id uuid not null, contact_id uuid, content_enc bytea,
  embedding vector(1536) not null, created_at timestamptz not null default now()
);
create index kc_embedding_idx on knowledge_chunks using hnsw (embedding vector_cosine_ops) with (m=16, ef_construction=64);
create index kc_tenant_idx on knowledge_chunks (tenant_id);
create index kc_contact_idx on knowledge_chunks (contact_id) where contact_id is not null;
```
**Trade-off:** HNSW faz pós-filtro por tenant — recall degrada se um tenant tiver muito mais chunks que a média. Mitigação: `hnsw.ef_search` maior + iterative index scan. Upgrade path: particionar por hash(tenant_id) se um tenant gigante aparecer.

### 1.5 Model Gateway + observabilidade

**`model_registry`** (schema, global). `task_type + tier + prioridade_fallback + ativo` já expressa roteamento e cadeia como linhas ordenadas — sem tabela separada de `model_routing_rules` (YAGNI).
`Índices: unique(task_type, tier, prioridade_fallback), parcial (task_type, tier) where ativo.`

**`model_circuit_state`** — estado do breaker em **tabela** (não memória de processo — Edge é frio; não Redis — infra desnecessária):
```
model_id uuid pk fk->model_registry, state enum(closed|open|half_open) default closed,
failure_count int default 0, opened_at timestamptz, half_open_at timestamptz, updated_at
RLS: ON sem policy (service-role-only, ADR-018).
```
Custo aceito: 1 round-trip a mais por decisão de roteamento. Trivial frente latência de LLM.

**`model_usage_log`** (schema = "llm_usage_events"). PARTICIONADA por RANGE(created_at) mensal.
`Índices: (tenant_id, created_at), (model_id, created_at), BRIN(created_at) p/ agregações amplas.`

### 1.6 Fila e idempotência

**`webhook_inbox`** — dedup global, não-particionada:
```
tenant_id uuid, provider_message_id text, received_at timestamptz default now(),
primary key (tenant_id, provider_message_id)
Purge: pg_cron TTL 7d. RLS: service-role-only.
```

**Fila por conversa:** pgmq (Supabase Queues, sem infra nova) + `pg_advisory_xact_lock(hashtext(conversation_id))` no worker → ordenação por conversa, paralelismo entre conversas. Fila NÃO é global (decisão travada).

---

## Pontos de integração

| Ponto | Runtime | Justificativa |
|---|---|---|
| **Webhook Evolution/OpenWA/Cloud** | Edge Function (Deno) | ACK <5s exigido pelo provedor. Função magra: valida → normaliza `fromMe` → resolve tenant → dedup `webhook_inbox` → enfileira (pgmq) → 200. Zero LLM aqui. |
| **MessageDebouncer** | Edge Function + pg_cron '10 seconds' | Debounce via `conversation_state.debounce_until`. Cron varre a cada 10s, faz flush dos vencidos. |
| **ConversationEngine** | Edge Function (Deno) + pgmq | Compila prompt 4 camadas → chama ModelGateway → executa tools → envia resposta via adapter. Tudo I/O-bound. |
| **Extração de documento** | Edge Function (fila pgmq) | Long-context, mas vai em chunks. Se estourar 400s, aí sim worker FastAPI — gatilho documentado na ADR-031. |
| **Embeddings** | Edge Function (batch) | ModelGateway com provider dedicado. Batch em chunks. |
| **Follow-up (48h, 1x)** | pg_cron (minuto) → enfileira pgmq | Varre `follow_ups` parcial `status='pendente'`; envio via worker. |
| **Confirmação de véspera** | pg_cron (diário) → enfileira pgmq | Varre `appointments` parcial (ativos, horário=amanhã). Timezone por tenant (coluna pendente). |
| **Resumo diário** | pg_cron (diário) → enfileira pgmq | Lê `conversation_signals` + agregações. |
| **Resumo de memória** | pg_cron (diário) → enfileira pgmq | Cron agenda; sumarização é LLM → Edge. |
| **Purge de retenção / LGPD** | pg_cron diário | Anonimiza expirados + drop partition. |
| **N8N** | Fora do caminho quente | Só ops: aquecimento de número (anti-ban), alertas operacionais. |

**Connection management:** Edge Functions → pooler **Supavisor em transaction mode**. Sem isso, N invocações de webhook esgotam conexões.

---

## ADRs (decisões não-óbvias)

### ADR-025 — Model Gateway multi-provider (estende ADR-019)

**Contexto:** GLM/Kimi/DeepSeek/MiniMax/NVIDIA divergem do stack padrão (Claude/GPT-4o/Groq). Três subproblemas: qualidade PT-BR, transferência internacional LGPD, estado do breaker.

**Decisão:**
- Estende o **Strategy Pattern da ADR-019**: cada provider é uma estratégia sob interface `ModelProvider`; `model_registry` (linhas ordenadas por `task_type+tier+prioridade_fallback`) é a fallback chain.
- **Critério de aceite de qualidade PT-BR:** golden set de ~20 diálogos rotulados por persona. Cada modelo candidato roda o set; pontuação por rubrica (naturalidade coloquial, aderência à instrução/núcleo, ausência de alucinação de preço/política). Modelo só entra em `conversa_principal` se score ≥ limiar. Golden set versionado no repo.
- **LGPD art. 33 (transferência internacional):** para provider estrangeiro, payload passa por **minimização pragmática** — telefone e CPF removidos (não mudam contexto da resposta), nome do cliente pode ficar (não é dado sensível o suficiente pra justificar perda de naturalidade). Provider sem DPA aceitável fica restrito a embeddings/batch.
- **Circuit breaker:** estado em **tabela `model_circuit_state`** (não memória de processo — Edge é frio; não Redis — infra desnecessária). Breaker por `model_id`; timeout por chamada; ao estourar `failure_count`, open por janela, depois half_open.
- **Provedor chinês SÓ no tier básico.** Premium = Claude/GPT-4o. Cliente premium paga por qualidade.

**Consequência:** golden set vira artefato de manutenção; DPA e minimização são pré-requisito de piloto com provider estrangeiro.

---

### ADR-026 — Retenção e direito ao esquecimento (LGPD)

**Contexto:** ContactMemory tem 2 horizontes; default 90d; apagar contato tem de apagar rastro; colide com partição e com backup PITR do Supabase.

**Decisão:**
- **Estado curto:** `conversation_state` (expira, GC por cron).
- **Memória longa:** resumos em `contact_memory_summaries` (nunca transcrição integral — mais barato e defensável), `expira_em` derivado de `plans.retencao_memoria_dias` (default 90).
- **Esquecimento = anonimização, não delete físico puro:** (a) hard-delete de `contact_memory_summaries` + `knowledge_chunks where contact_id`, (b) `messages`: anonimizar `conteudo_enc` (mantém linha p/ agregado), (c) `contacts` vira tombstone (PII nula, FK preservada).
- **Retenção em massa:** `drop partition` de messages/usage vencidas.
- **Backup PITR:** anonimização resolve o resíduo — backups velhos envelhecem e saem da janela. Documentar no DPA.

**Consequência:** "esquecimento" é imediato em produção e eventual no backup; tombstone preserva contadores históricos.

---

### ADR-027 — Compilação do prompt em 4 camadas como artefato de build

**Contexto:** PRD: "prompt final é artefato de build, nunca campo editável". Onde compila, cacheável, núcleo em código ou tabela?

**Decisão:**
- **Compilação:** `ConversationEngineService` (Edge Function).
- **Núcleo imutável (camada 1):** código versionado (não tabela — não deve ser editável sem PR/deploy). É a garantia da Story 18.
- **Persona (camada 2):** template em código.
- **Artesanal (camada 3):** `artisanal_layer_versions` publicada (admin).
- **Enriquecimento (camada 4):** `knowledge_base_entries` publicada (cliente) + RAG `knowledge_chunks` + memória.
- **Precedência estrita:** núcleo > persona > artesanal > enriquecimento. Núcleo nunca sobrescrito.
- **Cacheável:** hash de `(persona, artisanal.versao, knowledge.versao)` → cacheia prefixo compilado das camadas 1-3. Só camada 4 + memória variam por request.

**Consequência:** mudar núcleo exige deploy (intencional); cache de prefixo corta custo/latência; compilação é determinística e testável sem LLM.

---

### ADR-028 — Fila por conversa + idempotência de webhook

**Contexto:** fila serializada por conversa (não global), idempotência por message-id, e partição de messages impede unique global.

**Decisão:**
- pgmq (Supabase Queues, sem infra nova) + `pg_advisory_xact_lock(hashtext(conversation_id))` no worker → ordena por conversa, paraleliza entre conversas.
- Idempotência em `webhook_inbox` (não-particionada, pk(tenant_id, provider_message_id), TTL 7d) — porque índice unique em messages particionada teria de incluir created_at, quebrando a unicidade global do id do provedor.

**Consequência:** dedup fora de messages; tabela pequena com purge; ordenação garantida por conversa sem fila global.

---

### ADR-029 — Normalização de `fromMe` entre adapters + auto-pausa

**Contexto:** Evolution/OpenWA/Cloud sinalizam `fromMe` diferente; se o dono responde do próprio celular, a Iris não pode responder por cima (Story 22).

**Decisão:**
- `fromMe` normalizado em cada adapter para um booleano canônico é **critério de aceite da abstração WhatsAppGateway** (teste de contrato por adapter).
- `fromMe=true` de origem humana (distinguir pelo `provider_message_id` que a engine emitiu — se não foi emitido, é humano) dispara `HumanHandoffService` → auto-pausa a conversa por N horas, registra `handoff_events`.

**Consequência:** adicionar adapter novo exige passar no teste de normalização; falso-positivo mitigado por rastrear ids emitidos pela engine.

---

### ADR-030 — Gate de plano no Service; admin hardcoded; tenant via claim JWT

**Contexto:** gate roda no backend (nunca só front); admin sem tabela de roles; RLS precisa de tenant no JWT.

**Decisão:**
- `FeatureGateService.CheckFeatureGate` chamado por todo Service antes de ação limitada; painel cliente só **reflete** (`GET /api/plan/features`).
- **Admin = checagem hardcoded** `auth.uid()=VINICIUS_UUID` no Service → service_role client (ignora gate e RLS por papel, não por flag).
- **Tenant resolvido por Custom Access Token Hook** que injeta `app_metadata.tenant_id`/`is_admin` a partir de `tenant_members` (tabela aditiva, necessária para RLS e para `seats_painel`).

**Consequência:** 2º humano admin → trocar hardcode por `admin_users` (previsto no PRD como futuro); hook de token vira dependência de auth.

---

### ADR-031 — Engine em Edge Function; upgrade path documentado para worker

**Contexto:** Vercel Hobby corta em 300s (bug conhecido do vault). LLM+tools podem passar disso. Mas Edge Function do Supabase tem perfil diferente: wall-clock até 400s, e o limite real é CPU time (~2s) — esperar rede não consome CPU. Tudo no caminho quente é I/O-bound.

**Decisão:**
- **Engine em Edge Function (Deno)** + pgmq. Webhook ACK em Edge → dedup → enqueue → Edge Function consome fila, compila prompt, chama ModelGateway, executa tools, envia resposta.
- **pg_cron com intervalo de 10 segundos** para debounce (não precisa de worker persistente só pra isso).
- **Worker FastAPI (Fly.io/Railway)** vira upgrade path DOCUMENTADO: acionar quando extração de documento longo ou batch de embeddings provar que estoura o envelope de 400s/2s-CPU. Até lá, $0 de infra adicional.

**Consequência:** sem terceiro alvo de deploy; sem runtime Python em produção; upgrade path documentado na ADR, não esquecido. Se estourar, migração de UM módulo (extração/embeddings), não do produto.

---

## Decisões Desafiadas (output do grind)

> Stress-test realizado via `/grill-me` durante a Fase 3. Cada decisão abaixo foi questionada e mantida/resolvida.

| Decisão | Desafio | Resolução |
|---|---|---|
| Engine em Edge Function (não worker) | 300s Hobby, latência LLM, debounce sub-minuto | Edge Function Supabase: wall-clock 400s, CPU ~2s (I/O não conta). pg_cron aceita '10 seconds'. Upgrade path documentado. |
| Provedores chineses no tier básico | LGPD art.33, qualidade PT-BR | Minimização pragmática (telefone/CPF removidos, nome pode ficar). Golden set 20 diálogos/persona. Chinês NUNCA no premium. |
| pgcrypto em messages.conteudo | Custo CPU, impossibilita busca textual futura | Cifrado por padrão (defensável LGPD). Se busca em histórico virar requisito, reabre-se. |
| HNSW filtrado por tenant | Recall degrada se tenant grande | Mitigado por ef_search + iterative scan. Upgrade path: particionar por hash(tenant_id). |
| Circuit breaker em tabela (não Redis) | 1 round-trip extra por decisão | Trivial frente latência de LLM. Cache in-process com TTL no worker. |
| Admin hardcoded (sem tabela de roles) | 2º humano admin quebra | Previsto no PRD: migrar para `admin_users` quando necessário. |

---

## Plano pgcrypto

**Extensão:** `create extension pgcrypto with schema extensions`.

**Chaves:** pepper HMAC + chave simétrica `pgp_sym` no **Supabase Vault** (`vault.secrets`), lidas por funções `SECURITY DEFINER` em schema `private`, com `EXECUTE` revogado de `anon/authenticated`.

**Colunas cifradas:**

| Coluna | Função | Observação |
|---|---|---|
| `contacts.telefone_enc` | `pgp_sym_encrypt` | Leitura via decrypt no Service |
| `contacts.telefone_hash` | `hmac(tel, pepper, 'sha256')` — **determinístico** | Lookup do webhook: `WHERE tenant_id=$t AND telefone_hash = private.phone_hash($tel)` |
| `contacts.nome_enc` | `pgp_sym_encrypt` | Sem lookup direto |
| `contact_memory_summaries.resumo_enc` | `pgp_sym_encrypt` | Recuperação por `contact_id` |
| `messages.conteudo_enc` | `pgp_sym_encrypt` | Decrypt no Service ao montar DTO. Sem busca textual hoje. |
| `knowledge_chunks.content_enc` (só `source_type='contact_memory'`) | `pgp_sym_encrypt` | Conteúdo derivado de contato |

**Resolução do conflito telefone × lookup:**
`pgp_sym_encrypt` usa IV aleatório → ciphertext muda a cada escrita → impossível `WHERE telefone_enc = ?`. Solução: **hash determinístico HMAC-SHA256 para lookup + ciphertext para leitura**. Webhook computa `private.phone_hash($tel)` e busca `WHERE tenant_id=$t AND telefone_hash=$h`. `unique(tenant_id, telefone_hash)` garante dedup de contato.

**Migration:**
1. `001_extensions_pgcrypto_vault` — primeira, antes de qualquer tabela com PII: pgcrypto + schema `private` + `private.pii_key()`/`private.phone_hash()`/`private.encrypt_pii()`/`private.decrypt_pii()` (SECURITY DEFINER) + criação dos secrets no Vault.
2. `002_plans_tenants_tenant_members` — tabelas sem PII.
3. `003_contacts` — tabela com colunas bytea + hash.
4. Demais tabelas com PII (messages, contact_memory_summaries, knowledge_chunks).

---

## Risco em aberto (não resolvido nesta fase)

1. **Timezone por tenant:** `tenants` não tem `timezone` — jobs de confirmação de véspera e resumo diário dependem dela. Sync request registrado.
2. **Backups PITR × esquecimento:** anonimização deixa resíduo até a janela de backup vencer. Melhor opção disponível, mas resíduo real de compliance a declarar no DPA.
3. **Minimização de PII antes de provider estrangeiro:** depende de reconhecimento de entidade confiável em PT-BR. Se o minimizador falhar, vaza PII. Política definida, mecanismo não.
4. **`fromMe` de origem humana vs engine:** distinguir por id emitido pela engine é frágil se adapter não devolver o id no envio. Critério de aceite existe; robustez real só se prova com os 3 adapters em campo.