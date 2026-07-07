# Logos Iris — Planejamento Exploratório (Fable) · v2

> Matéria-prima bruta para interrogação crítica (grill-me). Nada aqui está decidido, exceto o que estiver marcado **[DECISÃO Vinicius]**.
> Legenda de confiança: **[alta]** = hipótese forte, **[média]** = plausível, **[especulação]** = ideia a testar.

---

## 1. A dor real

A dor não é "não ter um bot". A dor é que **o WhatsApp virou o balcão da empresa, mas continua sendo um celular pessoal**.

- **O dono é o gargalo.** [alta] Na PME típica, quem responde o WhatsApp é o dono ou a pessoa mais sobrecarregada. O atendimento compete com a operação: responde-se entre um cliente presencial e outro, à noite, no domingo. A empresa inteira passa por uma thread verde que ninguém gerencia.
- **Lead esfria em minutos.** [alta] Quem manda mensagem para 3 clínicas marca com a que responde primeiro. O custo da demora não aparece em relatório nenhum — o lead simplesmente some. A PME não perde para o concorrente melhor; perde para o concorrente mais rápido.
- **Não existe memória.** [alta] O que foi prometido, combinado, orçado — está espalhado em conversas que ninguém consegue buscar. Se o funcionário sai, leva o histórico e o relacionamento no bolso.
- **Inconsistência.** [média] Cada atendente responde de um jeito: preço errado, política de troca inventada na hora, tom que varia do formal ao constrangedor. O dono não tem como auditar.
- **Zero visão gerencial.** [média] O dono não sabe quantos contatos chegam por semana, quantos viram venda, por que os outros se perderam. O WhatsApp é a principal porta de entrada de receita e é um buraco negro de dados.
- **A ansiedade da fila invisível.** [especulação] Há um custo emocional real: a pilha de não-lidas às 22h. Parte do que se vende aqui não é eficiência — é **paz**. Isso pode importar mais no discurso de venda do que qualquer métrica.
- **No-show em agendamento.** [alta] Para negócios de agenda (clínica, salão, consultoria), horário vazio é prejuízo direto e a confirmação manual da véspera raramente acontece.

A síntese provocativa: a PME não sofre por falta de tecnologia de atendimento. Sofre porque **atendimento virou uma segunda profissão que ninguém na empresa foi contratado para exercer**.

---

## 2. Personas dos 4 agentes

Princípio comum ("jeito Iris"): mensageira, não máquina. Frases curtas, calor humano sem melação, zero burocratês, zero "Prezado cliente". A Iris conecta dois mundos — o cliente e o negócio — e cada persona é uma refração dessa mesma luz. *(Rascunho de tom, não prompt de produção.)*

**[DECISÃO Vinicius — identidade]** Identidade híbrida aprovada como direção: o agente se apresenta como "assistente da [empresa]", não nega ser IA quando perguntado diretamente. Validar detalhes com advogado antes do piloto (CDC/LGPD/termos Meta).

### Atendimento — a Anfitriã
Voz: calma, resolutiva, acolhedora sem ser servil. Não pede desculpas três vezes; resolve.
- "Oi! Deixa eu ver isso pra você — um minutinho ☺️"
- "Encontrei aqui: seu pedido saiu ontem e chega até quinta. Quer que eu te avise quando estiver em rota?"
- "Essa eu não sei responder de bate-pronto, mas já chamei alguém aqui que sabe. Não te deixo sem resposta."

### Vendas — a Consultora
Voz: pergunta antes de oferecer. Confiante sem pressionar; entusiasmo contido. Fecha com naturalidade, não com script de telemarketing.
- "Boa escolha 👌 Me conta uma coisa: é mais pra uso diário ou pra ocasião especial? Isso muda o que eu te indicaria."
- "Pelo que você descreveu, o plano intermediário te atende — o maior seria pagar por coisa que você não usa."
- "Consigo segurar esse valor até sexta. Quer que eu já deixe reservado no seu nome?"

### Agendamento — a Concierge
Voz: precisa, gentil, econômica. O objetivo dela é reduzir fricção: sempre oferece opções concretas, nunca pergunta aberta.
- "Tenho quinta às 14h ou sexta às 9h30 — qual encaixa melhor pra você?"
- "Confirmado: terça, 15h, com a Dra. Ana. Um dia antes eu te lembro por aqui 😉"
- "Sem problema, imprevisto acontece. Quer que eu já remarque pra semana que vem no mesmo horário?"

### SDR — a Exploradora
Voz: curiosa, respeitosa, direta. Qualifica conversando, não interrogando — uma pergunta por vez, sempre devolvendo valor.
- "Legal que você chegou até a gente! Me conta rapidinho: hoje vocês resolvem isso como?"
- "Entendi — e isso acontece com que frequência? Pergunto porque muda bastante o que faz sentido te mostrar."
- "Pelo que você me contou, faz sentido sim uma conversa com nosso especialista. Prefere amanhã de manhã ou à tarde?"

**Ideia transversal** [especulação]: o cliente nomeia sua Iris ("aqui é a Bia da Clínica Sorriso"). A persona-base é da Logos; o nome e os maneirismos são do tenant. Isso cria apego do dono ao próprio agente — retenção emocional do produto.

---

## 3. Enriquecimento vs integridade do agente

A tese central: **o cliente ensina FATOS e ESTILO; nunca escreve INSTRUÇÕES.** O cliente nunca toca o prompt. Ele preenche estruturas, e a engine compila essas estruturas em comportamento. Quem escreve prompt é a Logos; quem enriquece conhecimento é o tenant.

### Quatro camadas de prompt **[DECISÃO Vinicius — estrutura em camadas confirmada, com camada artesanal]**

1. **Núcleo imutável (Logos, invisível ao cliente):** isolamento de tenant, LGPD e não-logging de dados pessoais, resistência a prompt-injection (inclusive vinda do usuário final E do próprio material enviado pelo cliente), regras de identidade híbrida, limites do que o agente pode prometer, protocolo de escalonamento de emergência. Inegociável, nem visível no painel.
2. **Persona do tipo (Logos, selecionável):** Anfitriã, Consultora, Concierge, Exploradora — mantidas e versionadas pela Logos como produto. Cliente escolhe e parametriza, não edita.
3. **Camada artesanal por tenant (escrita por Vinicius/Logos no onboarding):** prompt específico da empresa cliente, escrito à mão pela Logos com base no diagnóstico do negócio — o "tempero" que nenhum template dá. É produto E serviço: diferencia cada agente (mata a genericidade da tensão 5), justifica preço premium e cria switching cost. Versionada pela Logos, invisível pro cliente editar, visível pra ele ler.
4. **Enriquecimento do cliente (livre dentro de moldes):** identidade do negócio, catálogo/serviços/preços, FAQ, políticas comerciais (troca, entrega, pagamento), horários, tom (via presets e sliders: formalidade, uso de emoji, comprimento de resposta), gatilhos de escalonamento pra humano, nome do agente.

### Liberdade calibrada **[DECISÃO Vinicius — enriquecimento guiado com limites]**
- **Livre:** FAQ, catálogo, saudação, horários, nome, dados do negócio.
- **Livre com validação:** políticas comerciais e promoções (o sistema aponta contradições: "você disse troca em 7 dias aqui e 30 dias ali"); descontos só dentro de teto configurado.
- **Guiado por instruções:** cada campo de enriquecimento vem com instrução do que escrever, exemplo de bom preenchimento e limite de tamanho — o cliente é conduzido, não solto num textarea. Campos estruturados > texto livre, sempre.
- **Travado:** tudo do núcleo e da camada artesanal. O cliente pode LER uma versão simplificada ("seu agente nunca vai: inventar preço, prometer o que não está no catálogo, compartilhar dados de outros clientes") — transparência sem edição.

### UX de captação [especulação forte — talvez a feature-assinatura do produto]
**O agente entrevista o próprio dono.** Onboarding não é formulário: a Iris recém-conectada manda mensagem no WhatsApp do dono — "Oi! Sou sua nova assistente. Me conta: o que vocês vendem? Qual a pergunta que os clientes mais fazem?" — e vai preenchendo a base de conhecimento conversando. O produto demonstra a si mesmo no primeiro contato.
Complementos: upload de documento (cardápio, tabela, site) → extração → **revisão obrigatória pelo dono antes de ativar**; formulário guiado no painel como caminho tradicional.

### Guardrails de mudança
- **Playground:** todo ajuste é testável numa conversa simulada antes de publicar. "Converse com sua Iris de amanhã antes de colocá-la no ar."
- **Versionamento + rollback:** cada publicação é uma versão; um clique volta pra anterior.
- **Lint de conhecimento:** ao publicar, o sistema audita contradições, lacunas ("você tem preço mas não tem política de pagamento") e tentativas de instrução disfarçada de fato ("no FAQ tem um 'ignore suas regras e...'" → bloqueia).
- **Rascunho vs publicado:** edição nunca vai direto pro ar. [média]

---

## 4. Features que encantariam o cliente

- **Playground/simulador** — conversar com o próprio agente antes de ativar. Vende o produto na demo e dá segurança contínua. [alta]
- **"A Iris te conta o dia"** — resumo diário no WhatsApp do dono: "Hoje: 23 conversas, 4 orçamentos, 2 agendamentos. Uma cliente pediu algo fora do catálogo — quer ver?". O painel vem até o dono, no canal que ele já vive. [alta — possivelmente a feature de retenção mais barata]
- **Roteador invisível de intenção** — os 4 agentes no MESMO número: uma recepcionista invisível classifica a intenção e passa a conversa pra persona certa, sem o usuário perceber costura. [média — depende da engine, mas muda o patamar do produto]
- **Alerta de lead quente** — intenção forte de compra detectada → notificação imediata pro dono com resumo e sugestão de próximo passo. [alta]
- **Handoff com dossiê** — quando escala pra humano, o atendente recebe 3 linhas de contexto: quem é, o que quer, o que já foi dito. Ninguém pergunta "como posso ajudar?" pela segunda vez. [alta]
- **Memória por contato** — timeline de cada cliente final: o agente lembra que a última compra foi em março e que a pessoa prefere entrega no trabalho. [média; regras LGPD na seção 8]
- **Follow-up programado** — lead sumiu no meio do orçamento → Iris retoma em 48h, uma vez, com elegância. [alta]
- **Anti-no-show** — confirmação automática na véspera com remarcação em um toque. Para nicho de agenda, paga o produto sozinha. [alta]
- **Áudio como cidadão de primeira classe** — cliente final manda áudio, agente entende (transcrição) e responde em texto. PME brasileira vive de áudio. [alta como necessidade]
- **Resposta em áudio com voz clonada do dono** — **[DECISÃO Vinicius]** aprovada como add-on premium (aumenta mensalidade). Exige: consentimento formal do dono pra clonagem, política clara de uso, e cuidado com a identidade híbrida (voz do dono + "sou assistente" precisa ser coerente). Diferenciação brutal em nichos de relacionamento (imobiliária, advocacia, estética). [média — validar aceitação no piloto]
- **Biblioteca de nichos** — templates prontos por vertical (clínica, advocacia, imobiliária, salão, construtora) alinhados aos nichos que a Logos já prospecta: agente 80% pronto no onboarding, camada artesanal + enriquecimento fazem os 20% restantes. [alta]
- **Nota de qualidade das conversas** [especulação] — auditoria periódica por IA das próprias conversas: "sua Iris resolveu 89% sem ajuda; nestas 3 ela patinou — quer ensiná-la?". Transforma manutenção da base de conhecimento em loop de melhoria contínua.

---

## 5. Desenho de sistema (liberdade total)

Peças conceituais, na ordem em que uma mensagem as atravessa:

1. **Gateway WhatsApp — 3 adaptadores atrás de UMA interface** **[DECISÃO Vinicius]**: Evolution API (primário) → OpenWA (fallback se Evolution falhar/degradar) → **WhatsApp Cloud API oficial como tier premium pago**. Consequência arquitetural inegociável: a engine NUNCA conhece o provedor — todo o resto do sistema fala com uma abstração `WhatsAppGateway` (enviar, receber, status, QR/pareamento), e cada adaptador implementa. Isso transforma o risco de ban (era a tensão nº 1) em decisão de produto: cliente que quer robustez oficial paga por ela. Atenção: OpenWA roda um Chromium por sessão — como fallback pontual ok, como primário não escala; e a API oficial tem custo por conversa da Meta + template approval — precificar isso no plano premium. [alta na estrutura]
2. **Resolutor de tenant + fila por conversa** — todo evento carrega `tenant_id` desde o nascimento. Fila serializada POR CONVERSA (não global): garante ordem das respostas e permite paralelismo entre conversas. Idempotência por ID de mensagem. [alta]
3. **Debounce de mensagens picadas** — brasileiro digita "oi" / "tudo bem?" / "queria saber um preço" em 3 mensagens. Buffer de alguns segundos agrega antes de acionar a engine — senão o agente responde três vezes e parece maluco. [alta — detalhe pequeno que separa "bot" de "gente"]
4. **Model Gateway — gestão multi-modelo** **[DECISÃO Vinicius — requisito novo]**: camada de roteamento de LLMs com registry administrável (painel admin da Logos, não do cliente). Provedores-alvo: **GLM (Zhipu), Kimi (Moonshot), DeepSeek, MiniMax** (preferência de custo/desempenho), **endpoints gratuitos da NVIDIA (build.nvidia.com/NIM)** para tarefas que tolerem rate limit, além de Claude/GPT-4o/Groq do stack padrão. Estrutura conceitual:
   - **Roteamento por tarefa:** triagem de intenção → modelo rápido/barato; conversa principal → modelo do tier do plano; extração de documento → modelo de contexto longo; embeddings → dedicado.
   - **Tier por plano:** "modelo melhor" é variável de precificação (seção 7) — plano básico roda em modelo chinês custo-eficiente, premium roda em modelo top.
   - **Fallback chain por função:** provedor caiu/rate-limitou → próximo da cadeia, com timeout e circuit breaker.
   - **Medição por modelo:** custo, latência e taxa de escalonamento POR MODELO POR TENANT — é isso que permite decidir cadeia e preço com dado, não opinião.
   - ⚠️ Divergência do stack padrão Logos (Claude/GPT-4o/Groq) → exige **ADR formal na Fase 3**, incluindo avaliação de qualidade em português brasileiro dos modelos chineses (o produto vive de PT-BR coloquial — isso é critério de aceite, não detalhe) e política de dados (enviar conversa de cliente final pra API chinesa tem implicação LGPD — avaliar no ADR). [alta na necessidade do ADR]
5. **Engine de conversação (única)** — o coração. Monta o **prompt compilado em camadas** (seção 3): núcleo imutável → persona do tipo → camada artesanal do tenant → enriquecimento do cliente → conhecimento recuperado (RAG na base do tenant, pgvector) → memória do contato → estado da conversa. Chama o modelo roteado pelo Model Gateway com ferramentas: consultar catálogo, propor horário, criar follow-up, escalar pra humano. O prompt final é artefato de build, nunca campo editável. [alta na estrutura]
6. **Camada de enriquecimento por tenant** — a base de conhecimento estruturada da seção 3, com embeddings por tenant, versionada (rascunho/publicado/histórico). [alta]
7. **Memória** — dois horizontes: estado da conversa (curto, expira) e memória por contato (longo: resumos periódicos por cliente final, não transcrição integral — mais barato e mais defensável em LGPD). [média]
8. **Handoff humano — cinto E suspensório** **[DECISÃO Vinicius — desenhar mecanismos múltiplos]**: pausa é sempre POR CONVERSA (nunca global, exceto "modo manual" explícito). Mecanismos em camadas:
   - **Botão no painel:** pausar/retomar qualquer conversa em um clique; "modo manual" global para férias do agente.
   - **Intervenção direta do dono:** ele responde pelo próprio celular → o sistema detecta mensagem `fromMe` que não foi gerada pela engine → auto-pausa aquela conversa por N horas. É o mecanismo mais natural: o dono não precisa aprender nada, só responder como sempre fez. Frágil sozinho (por isso as outras camadas). [média na detecção, alta no conceito]
   - **Comando do dono no chat:** dono digita um comando curto na própria conversa (ex: `#eu` pra assumir, `#iris` pra devolver) — explícito, sem depender de detecção.
   - **Pedido do cliente final:** "quero falar com uma pessoa" e variantes → pausa + notificação com dossiê.
   - **Baixa confiança da engine:** o agente não sabe → escala em vez de inventar.
   - **Retomada com resumo:** após N horas sem resposta humana, a Iris pergunta ao dono se pode reassumir — nunca reassume silenciosamente por cima de uma negociação humana.
9. **Painel (Next.js + Supabase)** — visualização (conversas ao vivo, métricas, timeline) + configuração (enriquecimento, playground, versões). RLS por tenant em tudo. Operações pesadas (extração de documento, embeddings, auditoria de qualidade) sempre em background job — nunca no request. **Painel admin Logos separado:** gestão de tenants, model registry, cadeias de fallback, custo por tenant. [alta]
10. **Observabilidade de custo** — medir tokens/custo POR CONVERSA, POR TENANT e POR MODELO desde o dia 1. A precificação por planos (seção 7) depende inteiramente desse dado. [alta — barato agora, caríssimo de reconstituir depois]

Fluxo resumido: `webhook (gateway N) → normaliza → tenant + fila → debounce → triagem (modelo barato) → engine (prompt 4 camadas + RAG + tools, modelo do plano) → ação/resposta → envio (gateway N) → memória atualizada`.

---

## 6. Design system (reescrito pós-auditoria anti-slop)

> A v1 desta seção caiu em três armadilhas catalogadas na skill `impeccable` do próprio vault: violeta-índigo como primária ("produto de IA → roxo" é o reflexo de categoria nº 1), "off-white quente" (o cream-default de 2026, banido nominalmente) e shimmer/gradiente espectral decorativo (gradient-adjacent slop). O que segue mantém a única ideia da v1 que sobrevive à auditoria e devolve o resto ao método correto.

### O que sobrevive: espectro como taxonomia funcional [média-alta]
O arco-íris da Iris não é decoração — é **sistema de informação**. Cada tipo de agente tem UMA cor sólida, usada só onde carrega significado: badge da conversa, filtro, série de gráfico. Atendimento / Vendas / Agendamento / SDR ganham 4 hues distinguíveis entre si e com contraste AA sobre as superfícies (valores exatos definidos na Fase 4 com validador da skill `dataviz`). Nunca gradiente, nunca shimmer, nunca as 4 cores juntas como enfeite. O usuário aprende a ler o próprio negócio por cor — isso é função, não estética.

### O que a Fase 4 deve decidir com método (não agora, não por reflexo)
A skill manda: **frase de cena física antes de dark/light** ("quem usa, onde, sob que luz, em que humor") e **estratégia de cor antes de cores** (restrained/committed/full/drenched). A cena provável do Iris: *dono de PME olhando o painel no celular entre um cliente e outro, luz de loja/consultório, pressa e ansiedade — buscando alívio, não imersão.* Se essa cena se confirmar no grill-me, ela aponta pra: tema claro, alta legibilidade, densidade média, estratégia **restrained** (neutros + espectro funcional ≤10% da superfície) — o espectro taxonômico É o acento; não precisa de segunda cor decorativa.

- **Proibições herdadas da skill (valem pra qualquer direção):** gradient text · glassmorphism decorativo · hero-metric template · grids de cards idênticos · eyebrow uppercase em toda seção · side-stripe borders · cream/sand como bg "quente" por default · fundo escuro "porque ferramenta bonita é dark".
- **Armadilha de segunda ordem, nomeada:** fugir do roxo-SaaS direto pra "editorial-tipográfico" também é lane saturada (a skill lista exatamente esse desvio). A Fase 4 deve rodar `palette.mjs` (seed de cor pra projeto novo) + `/ui-ux-pro-max` e testar a direção contra os DOIS níveis do category-reflex check.
- **Tipografia:** máximo 3 famílias, pareamento por eixo de contraste (serif display + grotesk de UI, ou família única com contraste de peso). Candidato conceitual a validar: **Spectral** (serif Google) como display — o nome amarra com o conceito sem gritar; UI em grotesk de alta legibilidade que NÃO seja o par Inter+Space Grotesk (monocultura de IA). Conversas renderizadas com tipografia próxima do WhatsApp — familiaridade no componente mais usado.
- **Movimento:** ease-out exponencial, sem bounce, reduced-motion obrigatório. O "agente pensando" merece um indicador próprio (não os três pontinhos genéricos), mas resolvido com craft na Fase 4 — não prescrever efeito de luz por reflexo poético.

### Voz da interface [média]
O painel fala como a Iris, em PT-BR direto, sem em dash na copy de UI. Empty state: "Nenhuma conversa ainda. Assim que alguém chamar, eu te mostro aqui." Erro: "Perdi a conexão com seu WhatsApp. Vamos reconectar?" Botões verbo+objeto: "Publicar mudanças", "Pausar conversa". O produto é a persona até no chrome — mas personalidade mora na copy e no comportamento, não em gradiente.

---

## 7. Precificação — planos + add-ons **[DECISÃO Vinicius — modelo de planos com variáveis de encarecimento]**

Estrutura: 2-3 planos base + add-ons destacáveis. Variáveis que encarecem (as 4 primeiras são as que Vinicius já definiu):

| Variável | Como escala |
|---|---|
| **API oficial da Meta** | Add-on/tier premium: estabilidade + zero risco de ban (repassa custo por conversa da Meta) |
| **Tier de modelo** | Básico: modelo custo-eficiente (chinês) · Premium: modelo top pra conversa |
| **Nº de agentes/personas ativos** | 1 tipo no básico → 4 tipos + roteador invisível no premium |
| **Limite de mensagens/conversas por mês** | Faixas de volume; excedente cobrado ou throttled |
| Nº de números WhatsApp conectados | Multi-unidade/filial paga por conexão |
| Retenção de memória por contato | 30 dias → 90 → 365 (interage com LGPD, seção 8) |
| Voz clonada do dono (resposta em áudio) | Add-on de assinatura (decisão 9) |
| Follow-ups automáticos | Quantidade/mês ou recurso de tier |
| Auditoria de qualidade + relatórios avançados | "Nota de qualidade" como recurso premium |
| Usuários do painel (seats) | Dono só → dono + equipe |
| Integrações (calendário, CRM) | Básicas inclusas, avançadas por tier |
| Camada artesanal (prompt Vinicius) | Incluso no onboarding premium; revisões periódicas como serviço recorrente |
| Onboarding assistido / SLA de suporte | Self-service vs acompanhado |
| White-label / API de acesso | Tier agência/enterprise futuro [especulação] |

Regra de ouro [alta]: nenhum preço se fixa antes da observabilidade de custo (seção 5, item 10) rodar no piloto — margem se calcula sobre custo medido por conversa, não estimado.

---

## 8. Tensões e perguntas em aberto (atualizadas pós-decisões)

1. ~~Risco de ban~~ → **endereçado por decisão** (gateway 3 camadas, seção 5.1). Resíduo em aberto: práticas anti-ban no tier não-oficial (aquecimento de número, limites de volume, jitter de digitação) e termo de responsabilidade no contrato. Ainda precisa constar do PRD.
2. ~~Revelar ser IA~~ → **direção decidida** (identidade híbrida). Resíduo: validação jurídica formal antes do piloto.
3. **Qualidade dos modelos chineses em PT-BR coloquial.** A preferência de custo por GLM/Kimi/DeepSeek/MiniMax só se sustenta se o agente continuar soando gente em português de WhatsApp. Precisa de bateria de avaliação comparativa ANTES de amarrar tier básico a modelo X — e os endpoints NVIDIA gratuitos têm rate limits que os tornam inviáveis pra produção de conversa (úteis pra dev/testes/batch). Além disso: enviar dados de conversa pra provedores chineses é decisão LGPD que precisa de ADR + possivelmente consentimento/contrato — não é só decisão técnica.
4. **Liberdade vs suporte** → mitigada pelo enriquecimento guiado com instruções (decisão 4) + camada artesanal. Medir no piloto: quantos tenants enriquecem sozinhos de verdade?
5. ~~Genericidade~~ → **endereçada pela camada artesanal** (prompt por empresa escrito pela Logos). Tensão residual: isso escala? Cada cliente novo = horas de Vinicius. Em 10 clientes ok; em 100, precisa virar metodologia treinável ou semi-automatizada — registrar como restrição de crescimento consciente.
6. **Handoff: coexistência humano+agente** → desenho em camadas decidido (seção 5.8). Resíduo técnico: confiabilidade da detecção `fromMe` nos 3 gateways (cada um expõe isso de um jeito — critério de aceite da abstração).
7. **Memória longa vs LGPD — proposta de resolução:** papéis definidos em contrato (tenant = controlador, Logos = operadora, DPA assinado); memória longa como resumos, nunca transcrição integral; retenção configurável por plano com default conservador (90 dias); fluxo de esquecimento por telefone (apagar contato = apagar memória + embeddings); dados pessoais criptografados (pgcrypto, regra global Logos); aviso de automação na primeira interação (coerente com identidade híbrida). Validar o pacote com advogado junto com o item 2.
8. **Escopo: produto completo em vez de MVP** **[DECISÃO Vinicius]**. Registrado — com um alerta de sócio: velocidade de construção com IA não elimina risco de construir a coisa errada; o que o MVP compra não é tempo de dev, é aprendizado barato. Proposta de meio-termo: escopo completo como alvo, mas decomposition (Fase 5) ordenada de modo que um subconjunto vendável fique de pé cedo e os pilotos comecem a usar ANTES do produto inteiro existir — feedback real corrigindo o restante do build enquanto ele acontece.
9. **Voz clonada** → aprovada como add-on (seção 4). Resíduos: consentimento formal de clonagem, coerência com identidade híbrida ("a voz é do dono mas quem fala é a assistente"?) e custo por áudio gerado no preço do add-on.
10. **Piloto artesanal, produto escalável:** com escopo completo decidido, o risco muda de figura — agora é construir MUITO antes do primeiro feedback real. Registrar conscientemente o que é serviço temporário (onboarding manual, camada artesanal) vs produto, senão o "temporário" vira o produto.

---

*Documento gerado como brainstorm (Fable), v2 pós-decisões de Vinicius. Próximo passo do processo: `/logos init LogosIris --tipo saas-premium` e interrogação crítica (grill-me) usando isto como insumo bruto — não como decisão final.*
