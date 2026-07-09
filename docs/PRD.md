# Logos Iris — PRD

> Fase 2 (`/logos`). Insumos: `docs/ideia.md` (travado, Fase 1) + `docs/planejamento-fable.md` (brainstorm bruto). Gerado 2026-07-08.

## Problem Statement

O dono de PME (clínica, salão, imobiliária, advocacia, contabilidade, construtora etc.) atende WhatsApp pessoalmente porque é o canal principal de vendas — e vira o gargalo da própria empresa. Isso produz cinco dores concretas, do ponto de vista do dono:

- Respondo entre um cliente presencial e outro, à noite, no domingo — e mesmo assim não dou conta.
- Lead que demoro a responder vai pro concorrente que respondeu primeiro — e eu nem sei que perdi.
- Não tenho memória do que já foi combinado com cada cliente; se o funcionário sai, leva o relacionamento.
- Não sei auditar o que meus atendentes prometem — preço errado, política inventada na hora.
- Não tenho visão nenhuma do que entra pelo WhatsApp: quantos contatos, quantos viram venda, por que os outros somem.
- (Negócios de agenda) Cliente não aparece e o horário vazio é prejuízo puro — confirmação manual da véspera raramente acontece.

## Solution

Um agente de WhatsApp por empresa (a "Iris" do tenant) que atende, vende, agenda e qualifica em nome do dono, com prompt em 4 camadas (núcleo Logos → persona → camada artesanal escrita pela Logos no onboarding → enriquecimento do cliente), memória por contato, handoff pra humano em múltiplas camadas de segurança, e visão gerencial entregue no próprio WhatsApp do dono. Lançamento com público amplo (não travado a 1 vertical) e escopo completo (4 personas: Atendimento/Vendas/Agendamento/SDR) — decomposition da Fase 5 decide a ordem de entrega vendável.

Dois planos de acesso ao sistema, papéis distintos:
- **Painel Admin (Logos/Vinicius):** controla tudo — tenants, model registry, cadeias de fallback, custo por tenant, camada artesanal de cada cliente. Superset de permissões, sem gate de plano.
- **Painel Cliente (tenant):** feature set amplo por padrão, mas modulado pelo plano contratado (ver Implementation Decisions → Feature Gating). O cliente nunca vê nem edita o que é do admin.

## User Stories

### Atendimento (Anfitriã)
1. Como cliente final, quero que a Iris responda minha dúvida sobre pedido/produto na hora, mesmo fora do horário comercial, para não esperar até o próximo dia útil.
2. Como cliente final, quero que a Iris saiba o que já foi combinado comigo antes, para não repetir informação toda vez que escrevo.
3. Como dono de PME, quero que a Iris escale pra mim quando não souber responder, ao invés de inventar, para não perder a confiança do cliente.
4. Como dono de PME, quero definir o tom de resposta (formalidade, uso de emoji, comprimento) para a Iris soar como minha empresa, não genérica.

### Vendas (Consultora)
5. Como cliente final, quero que a Iris me faça perguntas antes de empurrar um produto, para receber uma recomendação que faça sentido pro meu caso.
6. Como dono de PME, quero que a Iris consulte meu catálogo/preços reais e nunca invente valor, para não ter prejuízo com promessa errada.
7. Como dono de PME, quero receber alerta imediato quando a Iris detectar intenção forte de compra, para eu poder fechar pessoalmente se quiser.
8. Como dono de PME, quero que a Iris retome contato com lead que sumiu no meio do orçamento (follow-up programado, uma vez, com elegância), para recuperar venda que eu esqueceria de cobrar.

### Agendamento (Concierge)
9. Como cliente final, quero receber opções concretas de horário (não pergunta aberta), para agendar em uma troca de mensagem.
10. Como cliente final, quero confirmação automática na véspera com remarcação em um toque, para não perder o horário por esquecimento.
11. Como dono de PME, quero reduzir no-show sem precisar ligar pra cada cliente na véspera, para não ter prejuízo de horário vazio.

### SDR (Exploradora)
12. Como cliente final em fase de descoberta, quero ser qualificado com perguntas naturais (uma por vez), sem sentir interrogatório, para chegar rápido numa proposta relevante.
13. Como dono de PME, quero que leads qualificados sejam encaminhados pro especialista certo com contexto já levantado, para não desperdiçar tempo de venda repetindo perguntas.

### Enriquecimento por tenant / camada artesanal
14. Como dono de PME, quero preencher catálogo, FAQ, políticas e horários em campos guiados (com instrução e exemplo), para não precisar saber escrever prompt.
15. Como dono de PME, quero que o sistema aponte contradições no que eu preenchi (ex: "troca em 7 dias aqui, 30 dias ali"), para não publicar informação inconsistente.
16. Como dono de PME, quero testar qualquer mudança num playground antes de publicar, para não colocar no ar algo que não revisei.
17. Como dono de PME, quero poder reverter pra versão anterior da configuração em um clique, para desfazer erro de publicação rapidamente.
18. Como dono de PME, quero ler (sem editar) o que o núcleo e a camada artesanal do meu agente nunca vão fazer, para confiar no que foi construído pela Logos.
19. Como novo cliente, quero que a Iris me entreviste no WhatsApp pra montar minha base de conhecimento inicial, para não precisar preencher formulário longo sozinho.
20. Como novo cliente, quero revisar o que foi extraído de documento que enviei (cardápio, tabela, site) antes de ativar, para garantir que está correto.

### Handoff humano
21. Como dono de PME, quero pausar/retomar qualquer conversa específica em um clique no painel, para assumir pessoalmente quando quiser.
22. Como dono de PME, quero que, se eu responder direto pelo meu celular, o sistema detecte e pause a Iris automaticamente naquela conversa, para não haver duas respostas conflitantes.
23. Como dono de PME, quero um comando curto no próprio chat (`#eu` / `#iris`) pra assumir ou devolver a conversa, para ter controle explícito sem depender só de detecção automática.
24. Como cliente final, quero poder pedir "falar com uma pessoa" e ser atendido por humano com contexto (dossiê), para não repetir tudo que já disse.
25. Como dono de PME, quero que a Iris pergunte antes de retomar uma conversa pausada há muito tempo, para nunca sobrepor uma negociação humana em andamento.

### Painel Cliente
26. Como dono de PME, quero ver conversas ao vivo e métricas (contatos, orçamentos, agendamentos) no painel, para ter visão gerencial do meu WhatsApp.
27. Como dono de PME, quero receber um resumo diário da Iris no meu próprio WhatsApp ("hoje: 23 conversas, 4 orçamentos..."), para acompanhar sem precisar abrir o painel.
28. Como dono de PME, quero ver meu uso atual frente ao limite do meu plano (mensagens, agentes ativos, retenção de memória), para saber quando preciso fazer upgrade.
29. Como dono de PME em plano básico, quero ver quais recursos eu não tenho acesso ainda (ex: 4 personas, voz clonada, auditoria de qualidade), para entender o caminho de upgrade sem ficar confuso sobre o que "sumiu".

### Painel Admin (Logos)
30. Como admin Logos, quero gerenciar todos os tenants (criar, pausar, ver plano e uso) num painel único, para operar a base de clientes.
31. Como admin Logos, quero administrar o registry de modelos (quais provedores, roteamento por tarefa, cadeia de fallback) sem depender de deploy de código, para ajustar custo/qualidade rapidamente.
32. Como admin Logos, quero ver custo e latência por modelo por tenant, para decidir preço e roteamento com dado medido, não estimativa.
33. Como admin Logos, quero escrever/editar a camada artesanal de cada tenant a partir do painel, para não depender de acesso direto a banco.
34. Como admin Logos, quero que toda alteração feita por mim no painel admin tenha efeito imediato de configuração (sem gate de plano me limitando), porque eu sou quem define os planos, não quem é limitado por eles.

### Model Gateway (multi-provider)
35. Como sistema, preciso rotear triagem de intenção pro modelo mais barato disponível, para não gastar modelo caro em classificação simples.
36. Como sistema, preciso rotear a conversa principal pro modelo do tier contratado pelo tenant (básico = custo-eficiente, premium = top), para a precificação por plano fazer sentido.
37. Como sistema, preciso cair pro próximo provedor da cadeia quando o atual falhar ou rate-limitar (circuit breaker + timeout), para não derrubar o atendimento por instabilidade de um provedor só.
38. Como admin Logos, quero medir custo, latência e taxa de escalonamento por modelo por tenant, para alimentar decisão de preço e de cadeia.

### Precificação / planos
39. Como dono de PME, quero contratar um plano básico com 1 persona e modelo custo-eficiente, para começar barato e validar o valor do produto.
40. Como dono de PME, quero fazer upgrade pra ter as 4 personas + roteador invisível + modelo premium, quando eu perceber valor suficiente.
41. Como dono de PME, quero contratar a API oficial da Meta como add-on, quando eu quiser zero risco de ban e não me importar de pagar mais.
42. Como dono de PME, quero contratar voz clonada como add-on, com consentimento formal registrado, para diferenciação em nicho de relacionamento.

## Implementation Decisions

### Módulos (deep modules) — confirmados com Vinicius, testes concentrados nos 3 de maior risco (★)

1. **WhatsAppGateway** — interface única (`send`, `receive`, `status`, `pareamento`) sobre 3 adapters: Evolution API (primário) → OpenWA (fallback) → WhatsApp Cloud API oficial (tier premium pago). Engine nunca conhece o provedor concreto. Cada adapter normaliza detecção de `fromMe` de forma diferente — isso é critério de aceite da abstração (residual da Tensão #6 do brainstorm).
2. **TenantRouter + ConversationQueue** — resolve `tenant_id` desde o webhook; fila serializada por conversa (não global); idempotência por ID de mensagem. Cardinalidade tenant↔número WhatsApp é **1:1** neste PRD (schema simples); multi-número por tenant (multi-unidade/filial, já citado como variável de precificação no brainstorm) fica pra quando houver cliente real com essa necessidade — não modelar agora.
3. **MessageDebouncer** — agrega mensagens picadas do mesmo remetente num buffer de poucos segundos antes de acionar a engine.
4. **★ ModelGateway** — registry multi-LLM administrável via painel admin (não código). Provedores: GLM, Kimi, DeepSeek, MiniMax, NVIDIA NIM (endpoints gratuitos — só dev/teste/batch, rate limit inviabiliza produção), Claude, GPT-4o, Groq. Roteamento por tarefa (triagem → barato; conversa principal → tier do plano; extração de documento → contexto longo; embeddings → dedicado). Fallback chain com timeout + circuit breaker por função. Medição de custo/latência/taxa de escalonamento por modelo por tenant.
   - Divergência do stack padrão Logos Tech (Claude/GPT-4o/Groq) exige **ADR formal na Fase 3**: avaliação comparativa de qualidade PT-BR coloquial dos modelos chineses (critério de aceite, não detalhe) + implicação LGPD de enviar conversa de cliente final pra provedor chinês.
5. **★ ConversationEngine** — núcleo do produto. Compila prompt em 4 camadas (núcleo imutável → persona do tipo → camada artesanal do tenant → enriquecimento do cliente) + conhecimento recuperado (RAG, pgvector, por tenant) + memória do contato + estado da conversa. Chama modelo roteado pelo ModelGateway com tools (consultar catálogo, propor horário, criar follow-up, escalar humano). Prompt final é artefato de build — nunca campo editável por ninguém fora do pipeline de compilação.
6. **TenantKnowledgeBase** — base estruturada por tenant: campos guiados (instrução + exemplo + limite por campo, nunca textarea livre), validação de contradição, versionamento (rascunho/publicado/histórico), embeddings por tenant, lint de instrução disfarçada de fato ("ignore suas regras e..." → bloqueia na publicação). Entidade e versionamento **separados** da camada artesanal (item 4/módulo 5) — autores diferentes (cliente vs Logos), histórico de revisão não se mistura.
   - **Camada artesanal como entidade própria:** tabela/versionamento dedicado, editável só pelo painel admin Logos (item 33 das User Stories), cliente só lê versão simplificada — nunca compartilha registro/histórico com o enriquecimento do cliente.
7. **ContactMemory** — dois horizontes: estado de conversa (curto, expira) + memória por contato (longo: resumos periódicos, nunca transcrição integral — mais barato e mais defensável em LGPD). Retenção configurável por plano, default conservador (90 dias). Apagar contato apaga memória + embeddings.
8. **★ HumanHandoff** — pausa sempre por conversa (nunca global, exceto modo manual explícito). 5 gatilhos em camada: botão painel, detecção `fromMe` (auto-pausa N horas), comando no chat (`#eu`/`#iris`), pedido explícito do cliente final (+ dossiê de 3 linhas pro humano), baixa confiança da engine. Retomada nunca é silenciosa: Iris pergunta ao dono antes de reassumir após pausa longa.
9. **Painel Cliente** e **Painel Admin Logos** — dois apps/áreas distintos sobre o mesmo backend, Next.js 15 + Supabase, RLS por tenant em tudo.
   - **Painel Cliente:** conversas ao vivo, métricas, enriquecimento (campos guiados), playground, versionamento/rollback, uso vs limite do plano, indicador de recursos bloqueados por plano (com caminho de upgrade visível, nunca escondido).
   - **Painel Admin Logos:** gestão de tenants (criar/pausar/ver plano/uso), model registry + cadeias de fallback, custo por tenant/modelo, edição da camada artesanal por tenant, sem gate de plano — admin tem superset de permissões por definição de papel, não por feature flag. Acesso **hardcoded** (usuário Supabase do Vinicius = admin, checagem direta) — sem tabela de roles/admin_users neste PRD; introduzir quando houver 2º humano precisando de acesso admin.
   - Operações pesadas (extração de documento, embeddings, auditoria de qualidade) sempre em background job, nunca no request.
10. **Feature Gating por plano** — tabela `plan_features` (ou equivalente) mapeia `plano → { feature: limite|bool }`: nº de personas ativas, limite de mensagens/mês, nº de números conectados, retenção de memória, voz clonada (add-on), follow-ups automáticos/mês, auditoria de qualidade, seats do painel, integrações avançadas, API oficial Meta (add-on). Checagem de gate roda no backend (Service layer), nunca só no frontend — painel cliente reflete o gate, não o aplica. Painel admin ignora esse gate (superset).
11. **CostObservability** — tokens/custo por conversa, por tenant, por modelo, desde o primeiro dia. Precificação (não coberta por este PRD — decisão de negócio pendente de dado real do piloto) depende inteiramente desse dado.

### Fora do escopo de módulo (decisões transversais)
- Identidade híbrida: agente se apresenta como "assistente da [empresa]", não nega ser IA se perguntado — regra do núcleo imutável, não configurável pelo tenant.
- LGPD: tenant = controlador, Logos = operadora (DPA a formalizar fora deste PRD); dados pessoais criptografados em repouso (pgcrypto); aviso de automação na primeira interação.
- Práticas anti-ban (aquecimento de número, limites de volume, jitter de digitação) no tier não-oficial do WhatsAppGateway — termo de responsabilidade no contrato do tenant.

## Testing Decisions

Teste concentrado nos 3 módulos de maior risco (lógica de decisão pura, isolável do I/O de rede/WhatsApp/LLM):

- **ModelGateway:** dado um `tipo de tarefa` + `plano do tenant` + `estado da cadeia de fallback` (provedor X indisponível/rate-limitado), testar que o roteamento escolhe o modelo correto e que a cadeia de fallback avança na ordem certa com timeout/circuit-breaker — sem chamar modelo real (mock na fronteira do provedor).
- **ConversationEngine:** dado as 4 camadas de prompt + contexto recuperado + memória, testar que a compilação do prompt final é determinística e respeita a ordem/precedência das camadas (núcleo nunca é sobrescrito por enriquecimento do tenant) — sem chamar LLM real, testar só a montagem.
- **HumanHandoff:** dado cada gatilho isoladamente (botão, `fromMe`, comando `#eu`/`#iris`, pedido do cliente, baixa confiança), testar que o estado de pausa da conversa muda corretamente e que retomada após pausa longa nunca é silenciosa (sempre gera a pergunta de confirmação).

Só testar comportamento externo (input → output/estado), nunca detalhe de implementação interna. Sem prior art no repo (projeto novo, sem código) — primeira convenção de teste do produto nasce aqui; replicar padrão pros módulos ★ de fases futuras que tiverem perfil equivalente (lógica de decisão pura).

Demais módulos (WhatsAppGateway, TenantRouter, Debouncer, KnowledgeBase, ContactMemory, Painéis, Feature Gating, CostObservability) sem teste obrigatório neste PRD — decisão explícita do Vinicius, revisitar se algum virar fonte recorrente de bug.

## Métricas de Sucesso

- **Tempo de primeira resposta** (lead → primeira resposta da Iris): meta < 30s — é o job principal (captura de receita) medido diretamente.
- **Taxa de handoff sem repetição**: % de handoffs em que o cliente final não precisa repetir informação já dada (via dossiê de 3 linhas) — meta > 90%.
- **Taxa de resolução sem escalonamento**: % de conversas encerradas sem handoff humano — baseline a medir no piloto, sem meta fixada a priori (dado real > estimativa, mesma regra da precificação).
- **Redução de no-show** (tenants de agenda): comparar antes/depois de ativar confirmação automática — meta > 30% de redução.
- **Custo por conversa por tenant**: monitorado desde o dia 1 via CostObservability — pré-requisito de qualquer decisão de preço, não tem meta fixa neste PRD.
- **Taxa de contradição detectada na publicação de knowledge base**: sinaliza se o enriquecimento guiado está funcionando — sem meta, é métrica de acompanhamento de produto.

## Out of Scope

- Precificação final (valores, faixas) — depende de CostObservability rodando no piloto com dado real; este PRD entrega a estrutura de planos/add-ons, não os números.
- Validação jurídica formal de identidade híbrida, DPA LGPD, consentimento de voz clonada — trâmite fora do ciclo de engenharia, pré-requisito de piloto real mas não bloqueia build.
- Onboarding automatizado ("a Iris entrevista o dono") como caminho único — hipótese a validar (Fase 1), começa como um dos caminhos (junto de upload de documento + formulário guiado), não obrigatório.
- Biblioteca de nichos / templates por vertical prontos — feature de v2, não bloqueia lançamento amplo.
- Nota de qualidade das conversas (auditoria periódica por IA) — especulação no brainstorm, não entra nesta rodada.
- White-label / API de acesso / tier agência — futuro especulativo, fora de escopo.
- ADR do Model Gateway (avaliação PT-BR dos modelos chineses + implicação LGPD) — vira artefato da Fase 3, não deste PRD.

## Débitos registrados (spec-reviewer, não bloqueantes)

- Campo de "tom de resposta" (formalidade/emoji/comprimento via sliders, citado no brainstorm §3) ainda não tem `KnowledgeField` dedicado nos contracts — hoje cabe dentro de `dados_negocio` genericamente; nomear campo próprio quando o enriquecimento guiado for implementado (Fase 7-9).
- Endpoint de upload/revisão de documento (Story 20 — cardápio/tabela/site → extração → revisão do dono) não tem contrato próprio ainda; a extração já está prevista no ModelGateway (`task_type: extracao_documento`), falta só a rota de upload + tela de revisão. Endereçar na decomposition (Fase 5).

## Further Notes

- Escopo é produto completo (4 personas), não MVP — decisão explícita de Vinicius, com risco nomeado: construir muito antes de feedback real. Decomposition da Fase 5 deve ordenar um subconjunto vendável cedo (provável candidato: Atendimento + Agendamento, que cobrem a dor de captura de receita + no-show sem exigir toda a superfície de Vendas/SDR).
- Camada artesanal manual (prompt por tenant escrito por Vinicius) é bengala consciente de fase inicial — aceitável enquanto volume de clientes for baixo (sem verba de tráfego pago). Não é decisão de arquitetura permanente; revisitar quando o volume crescer.
- Painel Admin Logos existir como área separada do Painel Cliente (não é "modo admin" dentro do mesmo app) é decisão desta PRD, motivada pelo pedido do Vinicius: admin configura tudo, cliente vê feature set amplo mas modulado por plano — dois públicos, duas superfícies.
