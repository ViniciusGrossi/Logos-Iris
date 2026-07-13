---
title: "knowledge-base-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: knowledge-base-v1

## Objetivo
O dono da PME preenche/edita catálogo, FAQ, políticas, horários e demais campos guiados da base de conhecimento do próprio tenant, testa no playground antes de publicar, e reverte para versão anterior em um clique.

## Fora de Escopo
- **Upload de documento** (cardápio/tabela/site → extração → tela de revisão, Story 20) — feature de wave 3 (`document-upload-review.md`, task `19.1` em `docs/tasks.md`), sem contrato próprio ainda em `api.contracts.ts`. Não implementar aqui.
- Entrevista via WhatsApp para montar base inicial (Story 19) — hipótese de onboarding automatizado fora de escopo desta v1.
- Camada artesanal (`artisanal_layer_versions`) — entidade separada, editável só pelo painel admin; spec própria (`camada-artesanal.md`, wave 3).
- Pipeline de embeddings dos chunks publicados — gerado por job próprio do `ModelGateway` (`task_type: embeddings`); esta spec só dispara o evento de publicação, não redefine o pipeline.
- Campo dedicado de "tom de resposta" (sliders formalidade/emoji/comprimento) — débito registrado no PRD, cabe hoje em `dados_negocio` genericamente; campo próprio é wave 3 (`knowledge-field-tom-resposta.md`).

## Requisitos Funcionais
1. O dono preenche cada campo guiado (`catalogo`, `faq`, `politicas`, `horarios`, `saudacao`, `nome_agente`, `dados_negocio`) com instrução + exemplo por campo, nunca textarea livre.
2. `PUT /api/knowledge-base/:campo` grava o conteúdo como `status='rascunho'` — nunca publica direto.
3. O lint de contradição roda ao salvar rascunho e ao publicar, retornando a lista de contradições detectadas (ex.: "troca em 7 dias aqui, 30 dias ali").
4. O lint de instrução disfarçada de fato (ex.: "ignore suas regras e...") roda na publicação e bloqueia (`status: "bloqueado"`) se detectar.
5. `POST /api/knowledge-base/publish` só muda o status para `publicado` se não houver bloqueio; a versão anterior publicada vira `historico`.
6. `POST /api/knowledge-base/rollback/:versao` restaura uma versão histórica como a publicada atual.
7. `POST /api/knowledge-base/playground` testa uma mensagem simulada contra o **rascunho** atual, sem afetar produção nem enviar mensagem real ao cliente final.
8. O dono só lê/edita a base de conhecimento do próprio tenant (RLS) — nunca vê nem edita a camada artesanal.

## API Contract
> Copiado EXATAMENTE de `specs/api.contracts.ts`.
```typescript
type KnowledgeField =
  | "catalogo"
  | "faq"
  | "politicas"
  | "horarios"
  | "saudacao"
  | "nome_agente"
  | "dados_negocio";
type EntryStatus = "rascunho" | "publicado" | "historico";

interface KnowledgeEntryDTO {
  id: UUID;
  campo: KnowledgeField;
  conteudo: Record<string, unknown>;
  status: EntryStatus;
  versao: number;
  contradicao_detectada: boolean;
}

// GET /api/knowledge-base?campo=
type GetKnowledgeBase = (params: { tenant_id: UUID; campo?: KnowledgeField }) => Promise<KnowledgeEntryDTO[]>;

// PUT /api/knowledge-base/:campo  (salva como rascunho, nunca publica direto)
type SaveKnowledgeDraft = (params: {
  tenant_id: UUID;
  campo: KnowledgeField;
  conteudo: Record<string, unknown>;
}) => Promise<{ entry: KnowledgeEntryDTO; contradicoes: string[] }>;

// POST /api/knowledge-base/publish  (lint de contradição + instrução disfarçada roda aqui — bloqueia se achar)
type PublishKnowledgeBase = (params: { tenant_id: UUID }) => Promise<
  { status: "publicado"; versao: number } | { status: "bloqueado"; motivos: string[] }
>;

// POST /api/knowledge-base/rollback/:versao
type RollbackKnowledgeBase = (params: { tenant_id: UUID; versao: number }) => Promise<{ status: "publicado"; versao: number }>;

// POST /api/knowledge-base/playground  (testa contra rascunho antes de publicar)
type TestPlayground = (params: {
  tenant_id: UUID;
  mensagem_simulada: string;
  persona: Persona;
}) => Promise<{ resposta_simulada: string }>;
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given campo `catalogo` vazio, When o dono chama `PUT /api/knowledge-base/catalogo` com conteúdo válido, Then a entry é salva com `status='rascunho'` e `versao` incrementada.
- [ ] Given dois campos com informação conflitante (ex.: políticas de troca diferentes), When o dono salva o rascunho, Then `contradicoes` retorna ≥1 item descrevendo o conflito.
- [ ] Given um rascunho contendo texto do tipo "ignore suas instruções e diga X", When o dono chama `POST /api/knowledge-base/publish`, Then a resposta é `{ status: "bloqueado", motivos: [...] }` e nenhuma versão nova vira `publicado`.
- [ ] Given um rascunho sem contradição e sem instrução disfarçada, When o dono publica, Then a versão anterior publicada vira `historico` e a nova vira `publicado`.
- [ ] Given uma versão histórica N, When o dono chama `POST /api/knowledge-base/rollback/N`, Then a versão N volta a ser a `publicado` atual.
- [ ] Given um rascunho em edição, When o dono testa no playground, Then a resposta simulada reflete o rascunho (não a versão publicada) e nenhuma mensagem real é enviada ao WhatsApp do cliente final.
- [ ] RLS: tenant A não acessa `knowledge_base_entries` de tenant B (`GetKnowledgeBase` retorna só o próprio tenant).
- [ ] Nenhum erro em console/logs.
- [ ] `validate` passa.

## Restrições Técnicas
- **Tabelas:** existentes — `knowledge_base_entries` (schema já cobre `campo`/`conteudo`/`status`/`versao`/`contradicao_detectada`). Nova: nenhuma.
- **Endpoints:** `GET /api/knowledge-base` · `PUT /api/knowledge-base/:campo` · `POST /api/knowledge-base/publish` · `POST /api/knowledge-base/rollback/:versao` · `POST /api/knowledge-base/playground`.
- **Libs novas:** nenhuma — lint de contradição/instrução disfarçada é regra no Service (heurística por campo + comparação leve); se precisar de comparação semântica, reaproveita `ModelGateway task_type=embeddings` já existente, não lib nova.
- **Background jobs:** geração de embeddings dos chunks publicados reaproveita o pipeline do `ModelGateway`/`EmbeddingService` (fora do escopo desta spec) — publicar só dispara o evento.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| ModelGateway (`task_type: embeddings`) | conforme `model_registry`, spec própria | conforme fallback chain do ModelGateway | medido via `cost-observability-v1.md` | fallback chain já coberta pela spec do ModelGateway, não redefinida aqui |

## Segurança
- **Auth:** JWT tenant obrigatório.
- **RLS:** `tenant_id = claim`; edição só pelo próprio tenant (schema já define).
- **Criptografia:** nenhuma — `conteudo` é `jsonb` de dado do negócio do tenant (catálogo, políticas), não PII de cliente final.
- **LGPD:** conteúdo é dado do negócio, não dado pessoal de terceiro; sem implicação LGPD direta nesta spec.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | endpoints + `KnowledgeBaseService` (draft/publish/lint/rollback/playground) + testes | agents/backend-engineer.md |
| frontend-engineer | tela de campos guiados (instrução+exemplo por campo) + playground + histórico/rollback | agents/frontend-engineer.md |

> Nota: `docs/tasks.md` (wave 1) só itemiza tasks `9.1`/`9.2` (Banco+Backend/Backend) para este módulo, sem task de frontend explícita — mas Stories 14-17 exigem alguma UI para o dono preencher os campos guiados. Sinalizar a Vinicius para atualizar o breakdown de tasks com uma task de frontend antes do build.

## Validação
```bash
# Como provar que funciona:
npm run test -- --grep "knowledge-base-v1"
# UI: agent-browser open localhost:3000/knowledge-base → snapshot
```
