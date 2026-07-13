---
title: "whatsapp-gateway — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-integracoes"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: whatsapp-gateway

## Objetivo
O sistema recebe e envia mensagens de WhatsApp através de um de 3 provedores (Evolution API → OpenWA → WhatsApp Cloud API oficial) sem que nenhum Service a jusante (TenantRouter, ConversationEngine) precise saber qual provedor concreto está ativo, com `fromMe` normalizado para um booleano canônico e o webhook processado de forma idempotente.

## Fora de Escopo
- Resolução de `tenant_id` a partir do número de WhatsApp — módulo 2, ver `tenant-router-queue.md` (o Gateway entrega o payload já normalizado; quem resolve tenant é o Router).
- Debounce/agregação de mensagens picadas — módulo 3, ver `message-debouncer.md`.
- Multi-número por tenant — cardinalidade tenant:whatsapp_number é 1:1, travada no PRD; não modelar N:1 aqui.
- Práticas anti-ban (aquecimento de número, jitter de digitação, limites de volume) — fora do caminho quente, tratado via N8N (PRD, "Fora do escopo de módulo").
- Feature gating do add-on "API oficial Meta" (quem pode contratar Cloud API) — é `FeatureGateService` (módulo 10), não desta spec. O adapter Cloud API existe tecnicamente independente de quem tem direito a usá-lo.
- Pipeline de geração/transcrição de mídia (áudio, imagem, documento) — esta spec cobre só o shape do payload (`media_type`), não o processamento de conteúdo de mídia.

## Requisitos Funcionais
1. O sistema expõe uma interface única (`send`, `receive`, `status`, `pareamento`) que os Services consumidores usam sem conhecer o provedor concreto ativo do tenant.
2. Cada adapter (Evolution, OpenWA, Cloud API) normaliza o `fromMe` nativo do provedor para o mesmo booleano canônico em `WhatsAppWebhookPayload.from_me` — contrato de normalização único entre adapters (critério de aceite da abstração, ADR-029).
3. Toda mensagem recebida é gravada em `webhook_inbox` com chave `(tenant_id, provider_message_id)` antes de ser enfileirada — reentrega do provedor nunca duplica processamento (ADR-028).
4. Quando `from_me=true` é detectado e o `provider_message_id` não corresponde a nenhum id emitido pela própria engine (ou seja, é uma mensagem enviada por um humano direto do celular do dono), o gateway aciona `HumanHandoffService` para auto-pausar a conversa por N horas e registra `handoff_events` (ADR-029, Story 22).
5. O endpoint webhook responde `{ received: true }` em menos de 5s (ACK exigido pelo provedor); nenhuma chamada a LLM ou processamento pesado ocorre de forma síncrona no webhook — tudo pesado vai para pgmq.
6. Falha de credencial/pareamento do provedor ativo atualiza `whatsapp_connections.session_status` sem afetar tenants conectados a outros provedores.

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`. Só existe contrato HTTP para o webhook de entrada — `send`/`status`/`pareamento` são assinaturas internas do adapter, sem endpoint próprio (o Engine as invoca depois de já ter resolvido tenant/conversa). Documentado explicitamente abaixo, não é gap de contrato: o PRD já registra este módulo como infra interna.

```typescript
type UUID = string;
type ISODateTime = string;

type WhatsAppProvider = "evolution" | "openwa" | "cloud_api";

interface WhatsAppWebhookPayload {
  provider: WhatsAppProvider;
  tenant_whatsapp_number: string;
  from: string;
  message_id: string;
  content: string;
  media_type: "texto" | "audio" | "imagem" | "documento";
  from_me: boolean;
  timestamp: ISODateTime;
}

// POST /webhooks/whatsapp/:provider
type WebhookHandler = (payload: WhatsAppWebhookPayload) => Promise<{ received: true }>;
```

**Contrato interno (não HTTP)** — derivado de `ARCHITECTURE.md` (tabela Camadas C→S→R, "Gateway") + §1.2 (`whatsapp_connections`) + §1.6 (`webhook_inbox`):

```typescript
// WhatsAppGatewayService — consumido só por TenantRouterService/ConversationEngineService
interface WhatsAppGatewayAdapter {
  send(params: {
    tenant_id: UUID;
    to: string;
    content: string;
    media_type: "texto" | "audio" | "imagem" | "documento";
  }): Promise<{ provider_message_id: string }>;

  receive(rawPayload: unknown): WhatsAppWebhookPayload; // normaliza from_me aqui, por adapter

  status(tenant_id: UUID): Promise<{ session_status: "conectado" | "desconectado" | "pareando" }>;

  pareamento(tenant_id: UUID): Promise<{ qr_code_base64: string } | { status: "ja_pareado" }>;
}

// webhook_inbox (ARCHITECTURE.md §1.6) — dedup global, não-particionada, TTL 7d via pg_cron
interface WebhookInboxRow {
  tenant_id: UUID;
  provider_message_id: string;
  received_at: ISODateTime;
  // primary key (tenant_id, provider_message_id)
}

// whatsapp_connections (ARCHITECTURE.md §1.2) — 1:1 com tenant, RLS ON sem policy (ADR-018)
interface WhatsAppConnectionRow {
  tenant_id: UUID; // pk
  provider: WhatsAppProvider;
  instance_id: string;
  credentials_ref: string; // referência ao Supabase Vault, nunca segredo em claro
  session_status: "conectado" | "desconectado" | "pareando";
  updated_at: ISODateTime;
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given um payload Evolution com `fromMe: true` no formato nativo do provedor, When o adapter normaliza, Then `WhatsAppWebhookPayload.from_me` resultante é `true` (booleano canônico)
- [ ] Given um payload OpenWA com o equivalente a `fromMe` em formato/caminho diferente (ex.: aninhado em `key.fromMe`), When o adapter normaliza, Then o resultado usa o mesmo contrato booleano canônico do adapter Evolution — nenhuma diferença de shape vaza para fora do Gateway (teste de contrato por adapter, ADR-029)
- [ ] Given uma mensagem com `provider_message_id` já presente em `webhook_inbox` para o mesmo `tenant_id` (reentrega do provedor), When o webhook processa o payload de novo, Then a mensagem não é enfileirada uma segunda vez
- [ ] Given `from_me=true` e o `provider_message_id` NÃO está entre os ids emitidos pela engine para aquela conversa, When o gateway processa o evento, Then `HumanHandoffService` é acionado, a conversa entra em pausa por N horas e `handoff_events.gatilho='from_me_detectado'` é registrado
- [ ] Given `from_me=true` mas o `provider_message_id` corresponde a um envio da própria engine, When o gateway processa o evento, Then nenhuma auto-pausa é acionada (falso-positivo evitado)
- [ ] Given uma requisição válida em `POST /webhooks/whatsapp/:provider`, When processada, Then a resposta `{ received: true }` retorna sem aguardar chamada a LLM ou qualquer processamento síncrono do Engine
- [ ] RLS: tenant A não acessa dados de tenant B — `webhook_inbox` e `whatsapp_connections` têm RLS ON sem policy (service-role-only, ADR-018); nenhuma leitura `authenticated` é possível mesmo com JWT válido de outro tenant
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** `webhook_inbox` (nova, aditiva, ADR-028), `whatsapp_connections` (nova, aditiva, ADR-018). `contacts`/`conversations`/`messages` são tocadas a jusante (TenantRouter/Conversa), fora desta spec.
- **Endpoints:** `POST /webhooks/whatsapp/:provider` (único endpoint HTTP desta spec).
- **Libs novas:** nenhuma na abstração em si. Client HTTP concreto por adapter (Evolution API / OpenWA / WhatsApp Cloud API) é decisão de implementação do worker — checar `02-Knowledge/recursos-externos.md` antes de fixar lib.
- **Background jobs:** não diretamente — o Gateway só valida, normaliza, deduplica e enfileira (pgmq); o consumo da fila é do módulo 2 (`tenant-router-queue.md`).

**Gap encontrado (Spec Sync Request candidata):** o método `pareamento` faz parte da interface do módulo 1 (PRD) e o schema já expõe `whatsapp_connection_status` em `TenantSummaryDTO`, mas não existe em `specs/api.contracts.ts` nenhum endpoint para o admin disparar/exibir o QR code de pareamento durante o onboarding de um tenant. Registrado aqui; recomenda-se abrir Spec Sync Request para `POST /api/admin/tenants/:id/whatsapp/pairing` (ou equivalente) antes do build tocar a tela de onboarding do Painel Admin.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| Evolution API | self-hosted, não é LLM | dependente da instância própria | infraestrutura (VPS), sem custo por mensagem | → OpenWA |
| OpenWA | self-hosted, não é LLM | dependente da lib/instância | infraestrutura, sem custo por mensagem | → WhatsApp Cloud API (premium) |
| WhatsApp Cloud API (Meta) | oficial, tier premium (add-on) | rate limit oficial Meta por conversa/24h, por tier de negócio | por conversa iniciada (pricing Meta) | topo da cadeia — sem fallback abaixo |

## Segurança
- **Auth:** webhook é publicamente endereçável mas validado por assinatura/token do provedor (verificação na entrada do handler); nenhuma sessão de usuário Supabase envolvida neste ponto.
- **RLS:** `webhook_inbox` e `whatsapp_connections` — RLS ON, sem policy (service-role-only, ADR-018).
- **Criptografia:** nenhuma nesta camada diretamente — `webhook_inbox` não guarda conteúdo de mensagem, só `provider_message_id`. A cifragem do conteúdo (`messages.conteudo_enc`) acontece na persistência da mensagem, fora desta spec.
- **LGPD:** o payload do webhook contém dado pessoal do cliente final (telefone, conteúdo da mensagem) em trânsito; finalidade é a prestação do serviço de atendimento contratado pelo tenant (LGPD, tenant=controlador/Logos=operadora).

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | Endpoint webhook + 3 adapters (normalização `fromMe`, dedup, enqueue) + testes de contrato por adapter | agents/backend-engineer.md |
| frontend-engineer | Não aplicável nesta spec — infra interna sem UI própria | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "whatsapp-gateway"
# Normalização fromMe: fixture de payload por adapter (unit, sem WhatsApp real conectado)
# Idempotência: enviar o mesmo payload 2x ao endpoint local, checar count(webhook_inbox)=1
```
