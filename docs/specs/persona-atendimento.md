---
title: "persona-atendimento — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: persona-atendimento

## Objetivo
A Iris responde dúvidas do cliente final a qualquer hora usando a memória de conversas anteriores e escala para um humano quando não sabe responder com confiança, em vez de inventar.

## Fora de Escopo
- **Dependência dura de wave:** esta spec só pode ser construída depois de `whatsapp-gateway.md`, `tenant-router-queue.md`, `message-debouncer.md`, `model-gateway-v1.md` e `conversation-engine-v1.md` existirem — sem elas não há onde plugar o comportamento de Atendimento (mensagem precisa chegar normalizada, roteada, debounced, e o motor de compilação de prompt + roteador de modelo precisam existir).
- Personas Vendas/Agendamento/SDR (Stories 5-13) — fora desta spec.
- Camada artesanal e enriquecimento do cliente (camadas 3-4 do prompt) — `conversation-engine-v1.md` implementa só camadas 1-2; ver bloqueio da Story 4 abaixo.
- **Story 4 (tom de resposta configurável) — BLOQUEADA nesta wave.** Definir tom (formalidade/emoji/comprimento) exige ler dado específico do tenant, o que é, por definição, camada 4 (enriquecimento do cliente) do prompt — e `conversation-engine-v1.md` deixa essa camada explicitamente fora de escopo. Não é um Spec Sync Request (o contrato não diverge): é uma dependência de sequenciamento entre specs da mesma wave. Nesta spec, a Iris usa o tom padrão fixo do template de persona Atendimento (camada 2, código), sem customização por tenant. Story 4 vira spec própria (ou extensão desta) quando a wave de camadas 3-4 do Engine existir.
- `ContactMemory` como módulo completo (geração/sumarização periódica do resumo, retenção 90d, apagar-contato) — módulo 7, spec própria não incluída neste lote. Esta spec só **lê** `contact_memory_summaries` já existentes.
- `HumanHandoffService` completo (os 5 gatilhos, retomada não-silenciosa) — módulo 8 (★), spec própria não incluída neste lote. Esta spec só **aciona** o gatilho `baixa_confianca` via `PauseConversation`.

## Requisitos Funcionais
1. **(Story 1)** Quando o cliente final envia uma dúvida sobre pedido/produto, a Iris responde usando o prompt compilado (núcleo + persona Atendimento) mesmo fora do horário comercial — não há bloqueio de horário para responder automaticamente (só a disponibilidade do humano para escalonamento pode variar).
2. **(Story 2)** Antes de montar a chamada ao `ModelGateway`, o Service busca o `contact_memory_summaries` mais recente e não expirado (`expira_em > now()`) do contato e injeta o resumo como contexto adicional — para o cliente não repetir o que já foi combinado.
3. **(Story 3)** Quando a engine não consegue responder com confiança (tool "escalar humano" acionada, ou ausência de conhecimento suficiente para responder), o Service chama `PauseConversation` com `gatilho='baixa_confianca'` em vez de a Iris inventar uma resposta.
4. **(Story 4 — bloqueada)** Ver Fora de Escopo. Nesta wave, o tom de resposta é o default fixo do template de persona (camada 2), sem leitura de `dados_negocio`.

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts` — os trechos relevantes para acionamento de handoff. Não há endpoint próprio para "responder ao cliente"; isso é o pipeline já coberto pelas specs 1-5 (webhook → router → debounce → engine → gateway.send). Esta spec só adiciona o comportamento de persona (injeção de memória + acionamento de handoff por baixa confiança) sobre esse pipeline já existente.

```typescript
type UUID = string;
type ISODateTime = string;

type HandoffTrigger =
  | "botao_painel"
  | "from_me_detectado"
  | "comando_chat"
  | "pedido_cliente"
  | "baixa_confianca";

// POST /api/conversations/:id/pause
type PauseConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  gatilho: HandoffTrigger;
  pausada_ate?: ISODateTime;
}) => Promise<{ status: "pausada" }>;
```

**Shape de leitura (não HTTP)** — derivado de `product.schema.json` (`contact_memory_summaries`), consumido internamente por esta spec:

```typescript
interface ContactMemorySummaryRow {
  id: UUID;
  contact_id: UUID;
  tenant_id: UUID;
  resumo: string; // decrypt de resumo_enc no Service — nunca client-side
  periodo_inicio: ISODateTime;
  periodo_fim: ISODateTime;
  expira_em: ISODateTime; // derivado de plans.retencao_memoria_dias
  created_at: ISODateTime;
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given uma mensagem de cliente final chega fora do horário comercial do tenant, When o pipeline (gateway→router→debounce→engine) processa, Then a Iris responde normalmente — nenhuma lógica de "fora do expediente" bloqueia a resposta automatizada
- [ ] Given um contato com `contact_memory_summaries` não expirado (`expira_em > now()`), When a Iris monta a chamada ao `ModelGateway`, Then o resumo mais recente é incluído no contexto enviado ao modelo
- [ ] Given um contato sem nenhum `contact_memory_summaries` (cliente novo), When a Iris monta a chamada, Then a ausência de memória não quebra o fluxo — contexto de memória vazio é tratado como caso válido
- [ ] Given um `contact_memory_summaries` expirado (`expira_em <= now()`), When a Iris monta a chamada, Then o resumo expirado NÃO é injetado (retenção LGPD respeitada, ADR-026)
- [ ] Given a engine aciona a tool "escalar humano" (baixa confiança) durante o processamento, When isso ocorre, Then `PauseConversation` é chamado com `gatilho='baixa_confianca'` e a conversa muda para `status='pausada'`
- [ ] Given a persona Atendimento está ativa, When a resposta é gerada, Then usa o tom padrão fixo do template da camada 2 — nenhuma leitura de `dados_negocio` para tom ocorre nesta wave (afirma o bloqueio da Story 4, não é bug)
- [ ] RLS: tenant A não acessa dados de tenant B — busca de `contact_memory_summaries` sempre filtrada por `tenant_id=claim` e pelo `contact_id` do contato da própria conversa, nunca de outro tenant
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** `contact_memory_summaries` (schema, leitura), `conversations` (leitura/escrita de status via handoff), `handoff_events` (escrita, via `HumanHandoffService`), `contacts` (leitura, pgcrypto).
- **Endpoints:** nenhum novo — reusa `POST /api/conversations/:id/pause` (já definido no módulo Handoff); esta spec só cobre o acionamento pelo gatilho `baixa_confianca`, não o módulo Handoff completo.
- **Libs novas:** nenhuma.
- **Background jobs:** não nesta spec — a geração do resumo de memória em si (sumarização periódica) é job do módulo 7 (`ContactMemory`), fora deste lote; aqui há só leitura.

**Gap encontrado (não é Spec Sync Request — é ambiguidade de arquitetura):** nenhum campo em `messages`, `model_usage_log` ou em qualquer contrato define como o Service determina "baixa confiança" (um score? um threshold? a tool "escalar humano" sendo chamada pelo próprio modelo é o único sinal?). `ARCHITECTURE.md` nomeia `baixa_confianca` como um dos 5 gatilhos de handoff (ADR-029 cobre só `from_me_detectado`) mas não define o mecanismo de detecção nem em `Risco em aberto`. Registrado aqui para decisão antes do build tocar este critério — nesta spec assumo que o sinal é a própria tool "escalar humano" sendo invocada pelo modelo (mais simples e mais barato: delega o julgamento de confiança ao próprio LLM via tool-calling, sem heurística adicional de score).

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| ModelGateway (`conversa_principal`) | resolvido por `RouteModel` conforme `tier_do_plano` do tenant (ver `model-gateway-v1.md`) | herdado do provider escolhido | herdado do provider escolhido (`model_registry.custo_por_1k_tokens_*`) | fora desta spec — fallback dinâmico é wave futura |

## Segurança
- **Auth:** JWT obrigatório — fluxo autenticado do tenant via claim, já resolvido pelo `TenantRouter` a montante.
- **RLS:** `contact_memory_summaries`, `conversations`, `handoff_events` — todos `tenant_id=claim`.
- **Criptografia:** `contact_memory_summaries.resumo_enc` (`pgp_sym_encrypt`, plano pgcrypto de `ARCHITECTURE.md`) — leitura via decrypt no Service, nunca client-side.
- **LGPD:** sim — o resumo de memória é dado pessoal derivado do histórico do cliente final; finalidade é a continuidade do atendimento (Story 2); retenção derivada de `plans.retencao_memoria_dias` (ADR-026); resumo nunca é transcrição integral.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | Injeção de memória na chamada ao Engine + acionamento de handoff por baixa confiança + testes | agents/backend-engineer.md |
| frontend-engineer | Nenhuma tela nova — Painel Cliente Inbox já existe (Fase 4); validar que conversas pausadas por `baixa_confianca` aparecem corretamente no status já construído no protótipo | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "persona-atendimento"
# Injeção de memória: contato com/sem resumo válido, assert contexto correto
# Escalonamento: simular tool "escalar humano", assert PauseConversation(gatilho='baixa_confianca')
# UI: agent-browser open localhost:3000/inbox → snapshot (conversa pausada aparece com indicador correto, herdado do protótipo Fase 4)
```
