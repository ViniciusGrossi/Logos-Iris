---
title: "contact-memory — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: contact-memory

## Objetivo
A Iris lembra o que já foi combinado com cada contato via resumos periódicos (nunca transcrição crua), com retenção configurável por plano e apagamento em cascata quando o contato é esquecido (LGPD).

## Fora de Escopo
- Estado de conversa de curto prazo (`conversation_state`) — coberto pela spec do `ConversationEngine`.
- Heurística/modelo de sumarização em si (qual prompt, qual modelo) — usa `ModelGateway` já especificado em outra spec; esta spec cobre só onde/quando o resumo é persistido e expirado.
- ADR-026 completo (backup PITR, DPA) — resíduo de compliance em backup é risco em aberto documentado em `ARCHITECTURE.md`, fora do código desta spec.

## Requisitos Funcionais
1. Um job periódico gera um resumo do contato ao fim de um período de conversa e grava em `contact_memory_summaries.resumo_enc` (cifrado) — nunca a transcrição integral das mensagens.
2. `contact_memory_summaries.expira_em` é derivado de `plans.retencao_memoria_dias` do tenant no momento da criação do resumo.
3. Um job diário (`pg_cron`) varre `contact_memory_summaries` com `expira_em` vencido e hard-deleta o registro (LGPD, ADR-026).
4. A `ConversationEngine` consulta só os resumos vigentes (não expirados) do contato como parte da camada 4 do prompt (memória).
5. Ao marcar um `contact` como `deleted_at` (soft delete), o sistema hard-deleta em cascata `contact_memory_summaries` e `knowledge_chunks` (`where contact_id = X`) do mesmo contato (direito ao esquecimento).
6. Nenhum Service grava texto bruto de mensagens do cliente final em `resumo_enc` — só o resumo sintetizado pelo job de sumarização.
7. RLS: `tenant_id = claim` em toda leitura de `contact_memory_summaries`.

## API Contract
> Deriva de `specs/product.schema.json` (entidade `contact_memory_summaries`) — não há endpoint HTTP em `api.contracts.ts` para este módulo (consumo é interno, chamado pela `ConversationEngineService`). Interfaces abaixo são **derivadas**, não copiadas.
```typescript
interface ContactMemorySummaryDTO {
  id: UUID;
  contact_id: UUID;
  tenant_id: UUID;
  resumo: string; // decriptado de resumo_enc no Service — nunca exposto cru fora do tenant
  periodo_inicio: ISODateTime;
  periodo_fim: ISODateTime;
  expira_em: ISODateTime;
  created_at: ISODateTime;
}

// Chamada interna (não HTTP) — usada pela ConversationEngineService ao compilar a camada 4 do prompt
type GetActiveMemoryForContact = (params: { tenant_id: UUID; contact_id: UUID }) => Promise<ContactMemorySummaryDTO[]>;

// Chamada interna — disparada por job periódico (pg_cron → pgmq → Edge Function)
type SummarizeContactMemory = (params: {
  tenant_id: UUID;
  contact_id: UUID;
  periodo_inicio: ISODateTime;
  periodo_fim: ISODateTime;
}) => Promise<ContactMemorySummaryDTO>;
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given uma conversa com mensagens do período, When o job periódico de resumo de memória roda, Then `contact_memory_summaries` recebe um novo registro com `resumo_enc` preenchido e o texto puro nunca é persistido em nenhuma coluna.
- [ ] Given `plans.retencao_memoria_dias = 90` para o tenant, When um resumo é criado, Then `expira_em = created_at + 90 dias`.
- [ ] Given um resumo com `expira_em` no passado, When o job diário de purge roda, Then o registro é hard-deletado de `contact_memory_summaries`.
- [ ] Given um `contact` com `deleted_at` preenchido, When o soft-delete é processado, Then todos os `contact_memory_summaries` e `knowledge_chunks` (`source_type='contact_memory'`) daquele `contact_id` são hard-deletados.
- [ ] Given uma conversa em andamento, When a `ConversationEngine` monta a camada 4 do prompt, Then só resumos com `expira_em > now()` entram no contexto.
- [ ] RLS: tenant A não lê memória de um `contact_id` de tenant B (`GetActiveMemoryForContact` retorna vazio).
- [ ] Nenhum erro em console/logs (resumo de contato nunca aparece em log).
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `contact_memory_summaries`, `contacts`, `knowledge_chunks` (`source_type='contact_memory'`). Nova: nenhuma.
- **Endpoints:** nenhum HTTP direto (módulo interno, consumido pela `ConversationEngineService`).
- **Libs novas:** nenhuma.
- **Background jobs:** resumo periódico (`pg_cron` diário → `pgmq` → Edge Function) · purge de retenção (`pg_cron` diário).

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| ModelGateway (`task_type: conversa_principal` ou dedicado a sumarização) | conforme `model_registry`, spec própria | conforme fallback chain do ModelGateway | medido via `cost-observability-v1.md` | fallback chain já coberta pela spec do ModelGateway |

## Segurança
- **Auth:** service-role para os jobs; JWT tenant para leitura interna via Service (nunca client direto).
- **RLS:** `tenant_id = claim`.
- **Criptografia:** `resumo_enc` via `pgp_sym_encrypt` (chave no Supabase Vault), decrypt só no Service (`private.decrypt_pii`).
- **LGPD:** resumo de conversa é PII derivada — nunca transcrição integral; direito ao esquecimento implementado via cascade hard-delete ao soft-deletar o contato.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | job de sumarização + job de purge + cascade de esquecimento + testes | agents/backend-engineer.md |

> Sem tela dedicada nesta v1 — resumos não são expostos no painel cliente, consumidos só internamente pela `ConversationEngine`.

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "contact-memory"
# Sem UI nesta v1 — validação só via testes de unidade/integração do backend.
```
