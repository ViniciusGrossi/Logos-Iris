---
title: "painel-cliente-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-frontend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: painel-cliente-v1

## Objetivo
Ligar o protótipo aprovado na Fase 4 (`src/app/(cliente)/inbox/page.tsx` e `.../dashboard/page.tsx`, hoje com dados mock) a dados reais: listar/ler conversas, pausar/retomar o agente por conversa, e mostrar as métricas básicas do dia ("a Iris te conta o dia").

## Fora de Escopo
- **Recriar o visual do protótipo** — a UI (layout, componentes, tema claro) já passou pelo Handshake Visual da Fase 4 e está aprovada; esta spec troca só a fonte de dados (`@/mocks/*` → endpoints reais), não o desenho de tela.
- Enriquecimento (`knowledge-base-v1.md`) e playground — telas próprias, fora desta spec.
- Painel Admin (lista de tenants, billing) — spec própria da wave 4.
- Métrica `foraDoCatalogo` do mock do dashboard — ver Restrições Técnicas (não existe no contrato travado; removida nesta v1, não é Sync Request).
- Resumo diário via WhatsApp (texto enviado ao dono) — reaproveita `GetDailySummary`, mas o canal de envio é WhatsApp, não painel; fora do escopo desta spec (cobre só a leitura no painel).

## Requisitos Funcionais
1. Inbox lista conversas do tenant via `GET /api/conversations` com paginação obrigatória, filtro por `status` e `persona`, substituindo `@/mocks/conversations`.
2. Ao abrir uma conversa, o painel busca mensagens via `GET /api/conversations/:id/messages`, paginado, substituindo os dados mock de mensagens.
3. Botão pausar/retomar na Inbox chama `POST /api/conversations/:id/pause` e `POST /api/conversations/:id/resume` (endpoints definidos em `human-handoff.md`) — esta spec cobre a UI e o wiring, não a lógica de gatilhos.
4. Se `resume` retornar `{ status: "aguardando_confirmacao" }`, a UI exibe uma confirmação explícita ao dono antes de reenviar `confirmado_pelo_dono=true` — nunca reativa silenciosamente.
5. Dashboard busca métricas do dia via `GET /api/dashboard/summary` (`GetDailySummary`), substituindo `@/mocks/signals` / `dashboardTotals`.
6. Dashboard exibe exatamente os 4 campos do contrato: `total_conversas`, `orcamentos_gerados`, `agendamentos_criados`, `leads_quentes` — nenhum campo além destes.
7. O dono só vê conversas/métricas do próprio tenant (RLS).

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`.
```typescript
interface ConversationSummary {
  id: UUID;
  contact_nome: string | null;
  contact_telefone: string;
  persona_ativa: Persona;
  status: ConversationStatus;
  pausada_ate: ISODateTime | null;
  ultima_mensagem_preview: string;
  ultima_mensagem_em: ISODateTime;
}

// GET /api/conversations?status=&persona=&page=&limit=  (paginação obrigatória)
type ListConversations = (params: {
  tenant_id: UUID;
  status?: ConversationStatus;
  persona?: Persona;
  page: number;
  limit: number;
}) => Promise<{ items: ConversationSummary[]; total: number; page: number; limit: number }>;

interface MessageDTO {
  id: UUID;
  direcao: "recebida" | "enviada";
  conteudo: string;
  tipo_midia: "texto" | "audio" | "imagem" | "documento";
  created_at: ISODateTime;
}

// GET /api/conversations/:id/messages?page=&limit=
type GetConversationMessages = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  page: number;
  limit: number;
}) => Promise<{ items: MessageDTO[]; total: number }>;

// POST /api/conversations/:id/pause  (lógica dos 5 gatilhos definida em human-handoff.md — aqui só o botão do painel)
type PauseConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  gatilho: HandoffTrigger; // "botao_painel" nesta spec
  pausada_ate?: ISODateTime;
}) => Promise<{ status: "pausada" }>;

// POST /api/conversations/:id/resume
type ResumeConversation = (params: {
  tenant_id: UUID;
  conversation_id: UUID;
  confirmado_pelo_dono: boolean;
}) => Promise<{ status: "ativa" } | { status: "aguardando_confirmacao" }>;

// GET /api/dashboard/summary  (painel cliente — "a Iris te conta o dia")
type GetDailySummary = (params: { tenant_id: UUID; data: ISODateTime }) => Promise<{
  total_conversas: number;
  orcamentos_gerados: number;
  agendamentos_criados: number;
  leads_quentes: { conversation_id: UUID; resumo: string }[];
}>;
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given um tenant com conversas cadastradas, When a Inbox carrega, Then `ListConversations` retorna itens paginados e a UI renderiza a lista sem usar `@/mocks/conversations`.
- [ ] Given uma conversa selecionada, When o dono abre o histórico, Then `GetConversationMessages` retorna as mensagens paginadas e a UI renderiza sem usar dados mock.
- [ ] Given uma conversa ativa, When o dono clica "pausar", Then `PauseConversation` é chamado com `gatilho='botao_painel'` e a UI reflete `status='pausada'`.
- [ ] Given uma conversa pausada há muito tempo, When o dono clica "retomar", Then a UI recebe `{ status: "aguardando_confirmacao" }`, exibe um diálogo de confirmação, e só chama `resume` de novo com `confirmado_pelo_dono=true` após o dono confirmar explicitamente — nunca reativa sem essa etapa.
- [ ] Given métricas do dia disponíveis, When o Dashboard carrega, Then `GetDailySummary` alimenta os 4 cards (`total_conversas`, `orcamentos_gerados`, `agendamentos_criados`, `leads_quentes`) e nenhum card exibe um campo fora do contrato (ex.: `foraDoCatalogo` do mock antigo é removido).
- [ ] RLS: tenant A não vê conversas/métricas de tenant B (`ListConversations`/`GetDailySummary` retornam só o próprio tenant).
- [ ] Nenhum erro em console/logs (conteúdo de mensagem do cliente final nunca aparece em log).
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `conversations`, `messages`, `contacts`. Nova: nenhuma.
- **Endpoints:** `GET /api/conversations` · `GET /api/conversations/:id/messages` · `POST /api/conversations/:id/pause` · `POST /api/conversations/:id/resume` · `GET /api/dashboard/summary`.
- **Libs novas:** nenhuma — reaproveita Shadcn/Tailwind v4 já usados no protótipo Fase 4.
- **Background jobs:** nenhum nesta spec — `GetDailySummary` lê dados já agregados em request-time (agregação em si é responsabilidade do Repository/query, não um job).
- **Gap identificado:** o mock do protótipo (`dashboardTotals.foraDoCatalogo`) não tem campo correspondente em `GetDailySummary`. Decisão desta spec (não é Sync Request): remover o card na v1 — o contrato travado governa, YAGNI. Se o produto realmente precisar dessa métrica, abrir Spec Sync Request separado antes do build.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| N/A | N/A | N/A | N/A | Esta feature só lê dados já processados por outras specs (`conversations`, `messages`, `dashboard/summary`); nenhuma chamada direta a modelo/API externa. |

## Segurança
- **Auth:** JWT tenant obrigatório em todas as rotas.
- **RLS:** `tenant_id = claim` em `conversations`/`messages` (via join)/dashboard aggregation.
- **Criptografia:** `contact_nome`/`contact_telefone` já vêm decriptados pelo Service a partir de `contacts` (pgcrypto na tabela de origem, não nesta spec).
- **LGPD:** conteúdo de mensagem do cliente final é PII — nunca logado; exibido só dentro do painel autenticado do próprio tenant.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| frontend-engineer | Inbox real (task `12.1`) + Dashboard real (task `12.2`) — troca mock por fetch dos endpoints acima | agents/frontend-engineer.md |
| backend-engineer | Endpoints `ListConversations`/`GetConversationMessages`/`GetDailySummary` + wiring do botão pausar/retomar (task `12.3`, junto com `human-handoff.md`) | agents/backend-engineer.md |

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "painel-cliente-v1"
# UI: agent-browser open localhost:3000/inbox → snapshot ; agent-browser open localhost:3000/dashboard → snapshot
```
