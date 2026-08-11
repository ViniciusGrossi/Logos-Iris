---
title: "tenant-router-queue — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 0
tags: [spec, feature, sdd]
---

# Spec: tenant-router-queue

## Objetivo
O sistema resolve automaticamente qual tenant é dono de uma mensagem recebida e garante que mensagens da mesma conversa são processadas sempre em ordem, sem duplicação, mesmo com múltiplas conversas de tenants diferentes sendo processadas em paralelo.

## Fora de Escopo
- Normalização de `fromMe` e adapters de provedor — módulo 1, ver `whatsapp-gateway.md` (este módulo recebe o payload já normalizado).
- Debounce/agregação de mensagens picadas — módulo 3, ver `message-debouncer.md` (roda depois do enqueue por conversa).
- Multi-número por tenant — cardinalidade 1:1 travada no PRD, não modelar N:1 aqui.
- Lógica de negócio da conversa em si (compilação de prompt, chamada a modelo) — `ConversationEngine`, spec própria (`conversation-engine-v1.md`).

## Requisitos Funcionais
1. Dado `WhatsAppWebhookPayload.tenant_whatsapp_number`, o sistema resolve o `tenant_id` correspondente via `tenants.whatsapp_number` (unique).
2. Mensagens da mesma conversa são processadas sempre na ordem de chegada — fila serializada por conversa, nunca fila global.
3. Duas invocações concorrentes para a mesma conversa nunca processam simultaneamente (`pg_advisory_xact_lock(hashtext(tenant_id || ':' || contact_id))` no worker — chave estável derivada de tenant+contato, não de `conversation_id` literal, já que na 1ª mensagem a conversa ainda não existe; ver DESVIO 1 em `0016_tenant_router_queue.sql`).
4. Um `provider_message_id` já visto para o tenant nunca é enfileirado duas vezes — reafirma, no ponto de entrada da fila, o contrato de idempotência de `webhook_inbox` (ADR-028) estabelecido no módulo 1.
5. Se o número de WhatsApp do payload não corresponder a nenhum tenant ativo, a mensagem é descartada/logada sem lançar exceção que derrube o processamento do webhook.
6. A fila usa pgmq (Supabase Queues) — sem infraestrutura de fila externa nova (ADR-028).

## API Contract
> Não há endpoint HTTP para este módulo em `specs/api.contracts.ts` — é orquestração 100% interna entre o webhook (módulo 1) e o consumo pela engine (módulo 5). Derivado de `ARCHITECTURE.md` ADR-028 + §1.6 (Fila e idempotência). Documentado explicitamente: não é gap de contrato, o PRD já classifica este módulo como infra interna.

```typescript
type UUID = string;

interface TenantRouterService {
  resolveTenant(params: { tenant_whatsapp_number: string }): Promise<{ tenant_id: UUID } | null>;
}

// Shape do item enfileirado em pgmq — fila por conversa (não global)
interface ConversationQueueMessage {
  tenant_id: UUID;
  conversation_id: UUID;
  provider_message_id: string;
  payload: unknown; // WhatsAppWebhookPayload já normalizado pelo módulo 1
}

// Worker consumidor: dentro da transação que processa o item,
// pg_advisory_xact_lock(hashtext(tenant_id || ':' || contact_id)) garante exclusão mútua por
// conversa (ADR-028) — chave de tenant+contato, não conversation_id (que ainda não existe na 1ª mensagem).
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given um payload com `tenant_whatsapp_number` cadastrado em `tenants.whatsapp_number`, When o TenantRouter resolve, Then retorna o `tenant_id` correto
- [ ] Given um payload com número não cadastrado em nenhum tenant ativo, When o TenantRouter resolve, Then retorna `null` e a mensagem é descartada sem exceção não tratada
- [ ] Given duas mensagens da mesma conversa chegando em sequência rápida, When ambas são processadas, Then a segunda só inicia processamento depois que a primeira libera o advisory lock (ordem preservada)
- [ ] Given duas mensagens de conversas diferentes chegando simultaneamente, When ambas são processadas, Then processam em paralelo sem bloqueio cruzado (locks são por chave tenant+contato, nunca globais)
- [ ] Given um `provider_message_id` já registrado em `webhook_inbox` para o tenant, When a mesma mensagem é reprocessada, Then não é enfileirada de novo
- [ ] RLS: tenant A não acessa dados de tenant B — a resolução nunca retorna/vaza `tenant_id` de outro tenant mesmo com `whatsapp_number` malformado ou parcialmente coincidente
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** `tenants` (schema, existente, leitura), `webhook_inbox` (aditiva, módulo 1), `conversation_state` (aditiva, ARCHITECTURE §1.3 — `conversation_id`/`tenant_id` resolvidos aqui, `debounce_until` é consumido pelo módulo 3).
- **Endpoints:** nenhum HTTP novo — consumidor de fila acionado por pgmq dentro de Edge Function. A invocação periódica do consumidor é via `pg_cron` + `pg_net` (1x/minuto, `supabase/migrations/0017_tenant_router_worker_cron.sql`) — sem essa invocação, mensagens ficariam paradas em `whatsapp_inbound` indefinidamente (achado crítico do spec-reviewer, corrigido nesta correção).
- **Libs novas:** nenhuma (pgmq já é extensão Supabase decidida em ADR-028).
- **Background jobs:** sim — todo o processamento pós-enqueue roda em Edge Function assíncrona, nunca no request/response do webhook.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| — | não aplicável — módulo não chama LLM nem API externa, só orquestra fila/lock internos | — | infraestrutura Supabase (pgmq), sem custo por chamada externa | — |

## Segurança
- **Auth:** service-role — roda dentro do pipeline do webhook, sem sessão de usuário autenticado.
- **RLS:** `tenants` tem SELECT restrito a `tenant_id=claim` no painel, mas a resolução aqui roda via service-role (ainda não há claim de tenant resolvido neste ponto — é o próprio processo que descobre o tenant); `conversation_state`: leitura `tenant_id=claim`, escrita service-role.
- **Criptografia:** nenhuma — não introduz novo dado pessoal, só roteia identificadores já normalizados.
- **LGPD:** não aplicável diretamente (sem novo dado pessoal armazenado); o número de WhatsApp usado na resolução já é tratado como dado pessoal no módulo `contacts` (fora desta spec).

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | TenantRouterService + consumidor de fila + lock por conversa + testes de concorrência/idempotência | agents/backend-engineer.md |
| frontend-engineer | Não aplicável nesta spec — infra interna sem UI própria | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "tenant-router-queue"
# Concorrência: disparar 2 mensagens da mesma conversation_id em paralelo, afirmar processamento serializado
# Idempotência: mesmo provider_message_id 2x, afirmar 1 único enqueue
```
