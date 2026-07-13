---
title: "message-debouncer — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: message-debouncer

## Objetivo
Mensagens picadas do mesmo remetente numa janela curta de tempo são agrupadas num único buffer antes de acionar o Engine, para que a Iris responda ao conjunto da ideia do cliente em vez de a cada fragmento isoladamente.

## Fora de Escopo
- Resolução de tenant/fila por conversa — módulo 2, ver `tenant-router-queue.md` (o Debouncer opera sobre uma conversa já resolvida e enfileirada).
- Compilação de prompt e chamada ao modelo — módulo 5, ver `conversation-engine-v1.md`.
- Janela de debounce configurável por tenant/plano — o PRD não registra isso como requisito; a janela é fixa (poucos segundos, conforme `ARCHITECTURE.md`). Revisitar se virar requisito de produto.

## Requisitos Funcionais
1. Ao chegar uma mensagem para uma conversa, o sistema atualiza `conversation_state.debounce_until` para "agora + janela fixa" (poucos segundos).
2. Mensagens adicionais da mesma conversa chegando antes do `debounce_until` vencer estendem o buffer (novo `debounce_until`) em vez de disparar o Engine imediatamente.
3. Um cron (`pg_cron`, intervalo de 10 segundos, conforme ADR-031) varre `conversation_state` por registros com `debounce_until` vencido e faz o flush: agrega todas as mensagens do buffer numa única invocação do Engine.
4. Após o flush, `debounce_until` é limpo (`null`) até a próxima mensagem chegar.
5. Uma conversa sem mensagem pendente nunca é varrida desnecessariamente pelo cron — índice parcial `where debounce_until is not null` já definido em `ARCHITECTURE.md`.

## API Contract
> Não há endpoint HTTP para este módulo em `specs/api.contracts.ts` — é um mecanismo interno acionado por `pg_cron`. Derivado de `ARCHITECTURE.md` §1.3 (`conversation_state`) + Pontos de Integração (MessageDebouncer). Documentado explicitamente: não é gap de contrato, o PRD já classifica este módulo como infra interna sem teste obrigatório.

```typescript
type UUID = string;
type ISODateTime = string;

// conversation_state (ARCHITECTURE.md §1.3) — horizonte curto, 1:1 com conversa, expira
interface ConversationStateRow {
  conversation_id: UUID; // pk
  tenant_id: UUID;
  state: Record<string, unknown>; // slots/intent/pending_tool
  debounce_until: ISODateTime | null;
  expires_at: ISODateTime;
  updated_at: ISODateTime;
}

interface MessageDebouncerService {
  bufferMessage(params: { conversation_id: UUID; message_id: UUID }): Promise<{ debounce_until: ISODateTime }>;
  flushDue(): Promise<{ conversation_id: UUID; message_ids: UUID[] }[]>; // chamado pelo cron a cada 10s
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given uma conversa sem `debounce_until` ativo, When uma mensagem chega, Then `debounce_until` é setado para "agora + janela"
- [ ] Given uma conversa com `debounce_until` ainda no futuro, When uma segunda mensagem chega antes de vencer, Then `debounce_until` é estendido e o Engine NÃO é acionado ainda
- [ ] Given uma conversa com `debounce_until` vencido, When o cron varre `conversation_state`, Then todas as mensagens acumuladas desde o início do buffer são agregadas numa única chamada ao Engine
- [ ] Given o flush concluído para uma conversa, When o cron roda novamente, Then a mesma conversa não é processada de novo (`debounce_until` limpo, fora do índice parcial)
- [ ] Given uma conversa sem nenhuma mensagem pendente, When o cron varre, Then ela nunca é candidata (garantido pelo índice parcial `where debounce_until is not null`)
- [ ] RLS: tenant A não acessa dados de tenant B — leitura de `conversation_state` restrita a `tenant_id=claim`; escrita só service-role (cron/worker)
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** `conversation_state` (aditiva, existente em `ARCHITECTURE.md`).
- **Endpoints:** nenhum HTTP — Edge Function acionada por `pg_cron` a cada 10s.
- **Libs novas:** nenhuma (`pg_cron` já é extensão Supabase decidida).
- **Background jobs:** sim — o próprio debounce é um job (cron + flush), nunca síncrono no caminho do webhook.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| — | não aplicável — módulo não chama LLM nem API externa, só agrega mensagens via `pg_cron` | — | infraestrutura Supabase (`pg_cron`), sem custo por chamada externa | — |

## Segurança
- **Auth:** service-role (cron + worker).
- **RLS:** `conversation_state` — leitura `tenant_id=claim`, escrita service-role.
- **Criptografia:** nenhuma — `state` é jsonb operacional (slots/intent), não é o conteúdo cifrado da mensagem (`messages.conteudo_enc`, cifrado na persistência, fora desta spec).
- **LGPD:** `state` pode conter fragmentos de intenção/slot derivados da conversa; mesma finalidade de atendimento e mesmo tratamento de retenção do horizonte curto (expira via `expires_at`, ADR-026).

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | Buffer de debounce + cron de flush + testes de janela/extensão | agents/backend-engineer.md |
| frontend-engineer | Não aplicável nesta spec — infra interna sem UI própria | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "message-debouncer"
# Janela: fake timers, afirmar extensão de debounce_until a cada mensagem picada
# Flush: avançar tempo além da janela, afirmar agregação de N mensagens numa única invocação do Engine
```
