---
title: "Prompts de Produção — Logos Iris (ConversationEngine v1)"
date: 2026-08-13
projeto: "Logos Iris"
tags: [prompts, conversation-engine, adr-027]
---

# Prompts de Produção — ConversationEngine

Documentação formal de todo prompt de produção usado pela Iris hoje. **Fonte de verdade continua sendo o código** (`src/services/conversation-engine.service.ts`) — este diretório espelha e justifica cada camada (modelo alvo, temperatura, exemplo, grounding), não substitui a constante versionada. Ver ADR-027 (`docs/ARCHITECTURE.md`, linha ~249) para o porquê de núcleo/persona ficarem em código e não em tabela editável.

## Escopo desta v1

`conversation-engine-v1` (`docs/specs/conversation-engine-v1.md`) implementa só as camadas 1-2 do prompt de 4 camadas do produto:

| Camada | Nome | Onde vive | Nesta v1 |
|---|---|---|---|
| 1 | Núcleo imutável | Código (`NUCLEO`) | ✅ implementada — [nucleo.md](./nucleo.md) |
| 2 | Persona | Código (`PERSONA_TEMPLATES`) | ✅ implementada — 4 arquivos abaixo |
| 3 | Artesanal (por tenant, admin) | `artisanal_layer_versions` (tabela) | ❌ fora de escopo — não construída |
| 4 | Enriquecimento do cliente + RAG + memória | `knowledge_base_entries` / `knowledge_chunks` / `contact_memory_summaries` | ❌ fora de escopo — não construída |

As camadas 3-4 não têm documentação de prompt aqui porque não existem em código ainda — documentá-las agora seria inventar comportamento. Ficam para quando a wave correspondente for construída.

## Prompts documentados

| Arquivo | Camada | Persona | Modelo | Temperatura |
|---|---|---|---|---|
| [nucleo.md](./nucleo.md) | 1 — núcleo imutável | todas | claude-* | banda 0.2–0.5 (ver persona) |
| [persona-atendimento.md](./persona-atendimento.md) | 2 — persona | atendimento | claude-* | 0.3 |
| [persona-vendas.md](./persona-vendas.md) | 2 — persona | vendas | claude-* | 0.5 |
| [persona-agendamento.md](./persona-agendamento.md) | 2 — persona | agendamento | claude-* | 0.2 |
| [persona-sdr.md](./persona-sdr.md) | 2 — persona | sdr | claude-* | 0.4 |

## Como as camadas se compõem

`ConversationEngineService.compilePrompt({ persona_ativa })` retorna um `CompiledPromptV1` (`src/types/conversation-engine.types.ts`):

```typescript
interface CompiledPromptV1 {
  nucleo: string;  // camada 1 — imutável, código versionado
  persona: string; // camada 2 — template por Persona, código
  persona_ativa: Persona;
}
```

Dois pontos importantes, confirmados olhando o código e o teste adversarial (`src/tests/conversation-engine-v1.test.ts`, linhas 34-48):

1. **Nesta v1, `nucleo` e `persona` ficam estruturalmente separados** — a interface NÃO concatena as duas camadas em uma única string. Isso é deliberado: garante precedência núcleo > persona *por construção* (campos distintos, tipagem), não por sanitização de texto. O teste adversarial prova isso injetando um snippet do tipo "ignore as regras anteriores" no cenário de persona e confirmando que `nucleo` permanece intacto e presente como campo próprio.
2. **A ordem de precedência é núcleo (camada 1) primeiro, persona (camada 2) depois.** Essa é a ordem que a wave futura de execução (chamada real ao `ModelGateway`, fora do escopo desta spec — ver `docs/specs/model-gateway-v1.md`) deve respeitar ao montar o system prompt final de fato enviado ao modelo. Quando essa wave for construída, este índice deve ser atualizado para descrever o formato final de concatenação (provavelmente `nucleo + "\n\n" + persona`, mas isso ainda não existe em código — não documentar como se existisse).

## Modelo alvo (contexto de produto)

`ModelGateway.RouteModel` (`docs/specs/model-gateway-v1.md`) resolve o provider por `(task_type='conversa_principal', tier_do_plano)` a partir de `model_registry` — não há modelo hardcoded no `ConversationEngineService` (a chamada real ao gateway é wave futura, fora desta v1). `claude` é um `ModelProvider` válido nesse contrato e é o alvo de qualidade de referência para tier **premium** (ADR-025: "Provedor chinês SÓ no tier básico. Premium = Claude/GPT-4o. Cliente premium paga por qualidade."). Por isso todo prompt aqui é documentado como `modelo: claude-*` — é o alvo de design do texto, não uma amarração de código a um `model_id` específico (isso é responsabilidade do registry, editável sem deploy).

## Temperatura — nota geral

`compilePrompt` (v1) não tem parâmetro de temperatura — é função pura `(núcleo, persona) → prompt`, sem chamada ao modelo (Requisito 6 da spec). A chamada real ao `ModelGateway` com o prompt compilado é wave futura. Os valores de temperatura documentados aqui são **especificação de produto antecipada**, para a decisão não ficar solta em código improvisado quando a wave de execução for construída — não são (ainda) um parâmetro lido de configuração ou banco.

## Formato de saída

Todas as camadas produzem texto livre em português, consumido como mensagem de chat pelo WhatsApp Gateway (`src/adapters/whatsapp/*`). **Nenhum schema estruturado (JSON/XML/function-call) é definido nesta v1** — não documentar um formato que não existe no contrato (`docs/specs/conversation-engine-v1.md` não define saída estruturada).

## Confirmação de varredura

Grep em `src/` por `prompt|Prompt|"system"` (fora de arquivos de teste) e por `Você é|instrução do sistema` retornam matches só nos arquivos deste módulo (`conversation-engine.service.ts`, `.types.ts`, `.schema.ts`, `.errors.ts`, `.test.ts`) e em `specs/api.contracts.ts`/`specs/product.schema.json` (sem matches). Não há prompt de produção inline em nenhum outro lugar do código.
