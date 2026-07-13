---
title: "conversation-engine-v1 — Spec"
date: 2026-07-12
projeto: "Logos Iris"
fase: "build-backend"
status: draft
wave: 1
tags: [spec, feature, sdd]
---

# Spec: conversation-engine-v1

## Objetivo
O sistema compila deterministicamente o prompt das camadas 1 (núcleo imutável) e 2 (persona) respeitando precedência estrita (núcleo nunca sobrescrito), servindo de base para as chamadas ao `ModelGateway` que virão nas waves seguintes.

## Fora de Escopo
- **Camada artesanal (3)** e **enriquecimento do cliente (4)** do prompt — wave futura. `ADR-027` define as 4 camadas; esta spec só constrói 1-2.
- **RAG (`knowledge_chunks`) e `ContactMemory`** (memória por contato) — dependem da camada 4 existir; fora desta v1.
- **Execução de tools** (consultar catálogo, propor horário, criar follow-up, escalar humano) — depende do prompt completo (4 camadas) e de uma resposta real do modelo; esta v1 testa só a montagem do prompt, nunca o loop de execução pós-resposta.
- **Chamada real ao `ModelGateway`/LLM** — mockada nos testes desta spec (PRD, Testing Decisions: "sem chamar LLM real, testar só a montagem").
- **Cache de prefixo compilado** (hash de `persona + artisanal.versao + knowledge.versao`, ADR-027) — depende das camadas 3-4 existirem; nesta v1 recompila sempre (correto, não otimizado — YAGNI até as camadas 3-4 landarem).

## Requisitos Funcionais
1. O núcleo imutável (camada 1) é definido em código versionado, nunca em tabela editável — garantia da Story 18.
2. A persona (camada 2) é selecionada por `conversations.persona_ativa` e injetada como template em código — não editável por tenant nesta v1.
3. A compilação de `(núcleo, persona)` para o mesmo input é determinística: mesma entrada produz sempre o mesmo prompt final.
4. O núcleo nunca é sobrescrito, removido ou reordenado por conteúdo da persona — precedência estrita núcleo > persona (ADR-027).
5. O resultado da compilação é um artefato interno consumido pelo Service que chamará `ModelGateway.RouteModel` — nunca um campo editável por usuário/admin fora do pipeline de compilação (Story 18).
6. A função de compilação não faz nenhuma chamada de rede/LLM/banco — é uma função pura `(núcleo, persona) → prompt`.

## API Contract
> Não há endpoint HTTP para a compilação de prompt em `specs/api.contracts.ts` — é invocada internamente pelo Service da Conversa depois que o `message-debouncer` faz flush. Derivado de `ARCHITECTURE.md` ADR-027 (Compilação do prompt em 4 camadas) + tabela Camadas C→S→R ("Conversa"). Documentado explicitamente: não é gap de contrato.

```typescript
type Persona = "atendimento" | "vendas" | "agendamento" | "sdr";

// Esta v1 implementa só camadas 1-2; a assinatura evolui em wave futura
// para aceitar artisanal_layer_versions e knowledge_base_entries (camadas 3-4).
interface CompiledPromptV1 {
  nucleo: string;  // camada 1 — imutável, código versionado
  persona: string; // camada 2 — template por Persona, código
  persona_ativa: Persona;
}

interface ConversationEngineService {
  compilePrompt(params: { persona_ativa: Persona }): CompiledPromptV1;
}
```

## Critérios de Aceite (= test cases do worker)
- [ ] Given `persona_ativa='atendimento'`, When `compilePrompt` roda duas vezes com o mesmo input, Then o `CompiledPromptV1` resultante é idêntico nas duas chamadas (determinismo)
- [ ] Given qualquer `persona_ativa` válida, When `compilePrompt` roda, Then `nucleo` é sempre a mesma constante de código, independente da persona
- [ ] Given um template de persona hipotético contendo uma instrução do tipo "ignore as regras anteriores" (teste adversarial de precedência), When `compilePrompt` monta o resultado, Then `nucleo` permanece um campo estruturalmente separado e presente — a implementação não oferece nenhum mecanismo pelo qual o texto de `persona` possa sobrescrever ou remover `nucleo`
- [ ] Given as 4 personas (`atendimento`,`vendas`,`agendamento`,`sdr`), When `compilePrompt` roda para cada uma, Then cada uma produz um `persona` distinto e correspondente — nenhuma colisão/troca de template entre personas
- [ ] Given uma `persona_ativa` inválida vinda de fonte não tipada (ex.: valor corrompido no banco, fora do enum `Persona`), When `compilePrompt` é chamado, Then lança erro explícito em vez de compilar um prompt parcial/indefinido
- [ ] Given a execução de `compilePrompt`, When observado o comportamento, Then nenhuma chamada de rede/IO (fetch, `ModelGateway`, banco) ocorre — função pura
- [ ] RLS: não aplicável a este módulo em si — `compilePrompt` é função pura sem tabela própria; a leitura de `conversations.persona_ativa` que a alimenta já é RLS-protegida no Service que a busca (fora desta spec)
- [ ] Nenhum erro em console/logs
- [ ] `validate` passa

## Restrições Técnicas
- **Tabelas:** nenhuma nova. Lê, indiretamente e fora desta spec, `conversations.persona_ativa` (schema existente).
- **Endpoints:** nenhum HTTP — função interna, chamada dentro da Edge Function do Engine já enfileirado.
- **Libs novas:** nenhuma.
- **Background jobs:** não — função síncrona pura, chamada dentro do processamento assíncrono já enfileirado do Engine.

## Tokens e APIs Externas
| API | Modelo/Tier | Rate Limit | Custo estimado | Fallback |
|---|---|---|---|---|
| — | não aplicável — esta spec só monta o prompt; a chamada real ao modelo é do `model-gateway-v1` + wave futura de execução | — | — | — |

## Segurança
- **Auth:** chamado internamente, sem HTTP direto, dentro do fluxo pós-debounce.
- **RLS:** não aplicável (função pura, sem tabela própria nesta v1).
- **Criptografia:** nenhuma — nem núcleo nem template de persona contêm PII; são texto de configuração genérico, não dado de cliente.
- **LGPD:** não aplicável diretamente nesta v1 — a camada 4 (enriquecimento, fora de escopo) é onde entraria dado específico do tenant/cliente final.

## Sub-Agents Designados
| Agent | Task | SOP |
|---|---|---|
| backend-engineer | `compilePrompt` + 4 templates de persona (código) + testes de determinismo/precedência | agents/backend-engineer.md |
| frontend-engineer | Não aplicável nesta spec — sem UI própria | agents/frontend-engineer.md |

## Validação
```bash
npm run test -- --grep "conversation-engine-v1"
# Determinismo: mesma persona_ativa, 2 chamadas, assert deepEqual
# Precedência: assert que nucleo é constante/imutável independente de qualquer persona testada
```
