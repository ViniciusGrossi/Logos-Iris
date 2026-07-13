---
title: "human-handoff — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: human-handoff

## Objetivo
Pausar/retomar qualquer conversa específica (nunca globalmente, exceto modo manual explícito) via 5 gatilhos independentes, com retomada pós-pausa-longa sempre confirmada pelo dono — nunca silenciosa. Módulo ★ com teste obrigatório no PRD.

## Fora de Escopo
- Pausa manual global de todas as conversas do tenant (exceção rara citada no PRD) — não modelada nesta v1, só pausa por conversa.
- Dossiê completo de handoff — v1 cobre o dossiê de 3 linhas (resumo curto) exigido pela Story 24, não um relatório extenso.
- Heurística/modelo de "baixa confiança" da `ConversationEngine` — definida na spec do `ConversationEngine`; este módulo só consome o sinal e aplica a pausa.
- UI de pausar/retomar no painel — wiring do botão contra estes endpoints é escopo de `painel-cliente-v1.md` (task `12.3` em `docs/tasks.md`), não desta spec.

## Requisitos Funcionais
1. **Trigger `botao_painel`:** o dono aciona pausar/retomar no painel → `POST /api/conversations/:id/pause` (gatilho=`botao_painel`) ou `/resume`.
2. **Trigger `from_me_detectado`:** quando um adapter do `WhatsAppGateway` normaliza `from_me=true` de origem humana (id de mensagem não emitido pela engine — ADR-029), o sistema pausa automaticamente a conversa por N horas.
3. **Trigger `comando_chat`:** o dono digita `#eu` (pausa) ou `#iris` (retoma) na própria conversa do WhatsApp — o webhook detecta o comando e chama pause/resume internamente.
4. **Trigger `pedido_cliente`:** o cliente final pede explicitamente "falar com uma pessoa" — a tool de escalonamento da `ConversationEngine` detecta a intenção e chama pause (gatilho=`pedido_cliente`), gerando um dossiê de 3 linhas para o humano.
5. **Trigger `baixa_confianca`:** a `ConversationEngine` sinaliza confiança abaixo do limiar e chama pause (gatilho=`baixa_confianca`) antes de enviar qualquer resposta incerta.
6. Toda pausa é sempre por `conversation_id` — nunca afeta outras conversas do mesmo tenant.
7. **Retomada nunca silenciosa:** ao tentar retomar (`resume`) uma conversa pausada além do limite configurado de "pausa longa", o sistema responde `{ status: "aguardando_confirmacao" }` e não reativa até o dono confirmar explicitamente.
8. Só com `confirmado_pelo_dono=true` numa chamada subsequente de `resume` o `status` muda para `ativa`.
9. Cada pausa/retomada é registrada em `handoff_events` (`gatilho`, `acionado_em`, `resolvido_em`, `retomada_confirmada`).

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`; `HandoffEventDTO` é **derivado** de `specs/product.schema.json` (sem endpoint HTTP próprio).
```typescript
type HandoffTrigger =
  | "botao_painel"
  | "from_me_detectado"
  | "comando_chat"
  | "pedido_cliente"
  | "baixa_confianca";
type ConversationStatus = "ativa" | "pausada" | "encerrada";

// POST /api/conversations/:id/pause
type PauseConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  gatilho: HandoffTrigger;
  pausada_ate?: ISODateTime;
}) => Promise<{ status: "pausada" }>;

// POST /api/conversations/:id/resume
// Nunca silenciosa se pausa foi longa — Service layer decide se precisa gerar pergunta de confirmação ao dono antes de aplicar.
type ResumeConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  confirmado_pelo_dono: boolean;
}) => Promise<{ status: "ativa" } | { status: "aguardando_confirmacao" }>;

// Derivado de specs/product.schema.json (entidade "handoff_events") — leitura interna do Service
// para montar o dossiê de 3 linhas e o histórico de gatilhos; sem endpoint HTTP próprio.
interface HandoffEventDTO {
  id: UUID;
  conversation_id: UUID;
  gatilho: HandoffTrigger;
  acionado_em: ISODateTime;
  resolvido_em: ISODateTime | null;
  retomada_confirmada: boolean;
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] **Trigger `botao_painel`:** Given uma `conversation` com `status='ativa'`, When `POST /api/conversations/:id/pause` é chamado com `gatilho='botao_painel'`, Then `status` muda para `pausada` e um `handoff_events` é criado (`gatilho='botao_painel'`, `resolvido_em=null`).
- [ ] **Trigger `from_me_detectado`:** Given uma mensagem `from_me=true` cujo `provider_message_id` não corresponde a nenhum id emitido pela engine, When o `WhatsAppGateway` normaliza o evento, Then `HumanHandoffService` pausa a conversa automaticamente por N horas e grava `handoff_events(gatilho='from_me_detectado')`.
- [ ] **Trigger `comando_chat`:** Given uma `conversation` ativa, When o webhook recebe do dono uma mensagem com conteúdo exatamente `#eu`, Then a conversa pausa (`gatilho='comando_chat'`); When recebe `#iris` numa conversa pausada há pouco tempo, Then a conversa retoma direto (sem confirmação, pois não é pausa longa).
- [ ] **Trigger `pedido_cliente`:** Given uma conversa ativa, When o cliente final pede explicitamente "falar com uma pessoa" (detectado pela tool de escalonamento), Then a conversa pausa (`gatilho='pedido_cliente'`) e um dossiê de 3 linhas é gerado e fica disponível ao humano.
- [ ] **Trigger `baixa_confianca`:** Given uma resposta da `ConversationEngine` com confiança abaixo do limiar configurado, When a engine decide não responder, Then a conversa pausa (`gatilho='baixa_confianca'`) **antes** de qualquer mensagem incerta ser enviada ao cliente final.
- [ ] **Resume nunca silencioso (pausa longa):** Given uma `conversation` pausada há mais tempo que o limite configurado de "pausa longa", When `POST /api/conversations/:id/resume` é chamado com `confirmado_pelo_dono=false` (ou omitido), Then a resposta é `{ status: "aguardando_confirmacao" }` e nenhuma mensagem é reenviada pela Iris até `confirmado_pelo_dono=true` numa chamada subsequente.
- [ ] Given a mesma `conversation` do item anterior, When o dono confirma explicitamente (`confirmado_pelo_dono=true`), Then `status` muda para `ativa` e `handoff_events.retomada_confirmada=true`.
- [ ] RLS: tenant A não pausa/retoma `conversation_id` de tenant B (Service rejeita, nenhum registro de outro tenant é alterado).
- [ ] Nenhum erro em console/logs (conteúdo de conversa do cliente final nunca aparece em log).
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `conversations` (`status`, `pausada_ate`), `handoff_events` (schema + `tenant_id` aditivo, ARCHITECTURE.md §1.3). Nova: nenhuma.
- **Endpoints:** `POST /api/conversations/:id/pause` · `POST /api/conversations/:id/resume`.
- **Libs novas:** nenhuma.
- **Background jobs:** nenhum — "pausa longa" é avaliada em request-time no `resume` (comparando `now()` com `acionado_em`/`pausada_ate` contra um limiar configurável), sem cron necessário. Auto-pausa por `from_me_detectado` usa N horas configurável, também sem migration nova.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | Esta feature não chama modelo/API externa diretamente — consome sinais de `WhatsAppGateway` (normalização `from_me`) e `ConversationEngine` (baixa confiança, intenção de escalonamento), ambos especificados em outras specs. |

## Segurança
- **Auth:** JWT tenant obrigatório nas rotas de painel; webhook usa validação de assinatura do provider (coberta na spec do `WhatsAppGateway`) antes de acionar pause internamente.
- **RLS:** `tenant_id = claim` via join em `conversations.tenant_id` (política de `handoff_events` conforme ARCHITECTURE.md §1.3).
- **Criptografia:** nenhum campo pgcrypto nesta tabela (`gatilho`/timestamps não são PII).
- **LGPD:** o dossiê de 3 linhas pode conter dado do cliente final — deve ser derivado de `contact_memory`/`messages` já cifrados, nunca reexpor dado bruto além do necessário para o humano assumir a conversa.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | `HumanHandoffService` (5 gatilhos + resume) + 1 teste individual por gatilho + teste de resume-com-confirmação (módulo ★) | agents/backend-engineer.md |

> Wiring do botão Pausar/Retomar no painel é escopo de `painel-cliente-v1.md` — não duplicar aqui.

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "human-handoff"
# 5 testes de trigger + 1 teste de resume-com-confirmação (módulo ★, teste obrigatório no PRD)
```
