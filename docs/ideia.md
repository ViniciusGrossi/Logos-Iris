# Logos Iris — Ideia

> Fase 1 (`/logos`). Insumo bruto: `docs/planejamento-fable.md` (brainstorm Fable, v2). Interrogado via `/grill-me` em 2026-07-08.

## Problema

O WhatsApp virou o balcão da empresa, mas continua sendo um celular pessoal.

- **O dono é o gargalo.** Na PME típica, quem responde o WhatsApp é o dono ou a pessoa mais sobrecarregada. Atendimento compete com operação: responde-se entre um cliente presencial e outro, à noite, no domingo.
- **Lead esfria em minutos.** Quem manda mensagem pra 3 concorrentes marca com quem responde primeiro. O custo da demora não aparece em relatório nenhum — o lead simplesmente some. A PME não perde pro concorrente melhor; perde pro mais rápido.
- **Não existe memória.** O que foi prometido, combinado, orçado está espalhado em conversas que ninguém consegue buscar. Funcionário sai, leva histórico e relacionamento no bolso.
- **Inconsistência.** Cada atendente responde de um jeito — preço errado, política inventada na hora. O dono não audita.
- **Zero visão gerencial.** O WhatsApp é a principal porta de entrada de receita e é um buraco negro de dados.
- **No-show em agendamento.** Pra negócio de agenda, horário vazio é prejuízo direto; confirmação manual da véspera raramente acontece.

Síntese: a PME não sofre por falta de tecnologia de atendimento. Sofre porque atendimento virou uma segunda profissão que ninguém na empresa foi contratado pra exercer.

## Público-alvo

PME onde o dono (ou responsável único) faz o atendimento via WhatsApp como canal principal de vendas/atendimento — não travado a uma vertical no lançamento (clínica, salão, imobiliária, advocacia, contabilidade, construtora, etc. compartilham o mesmo padrão de dor).

**Decisão de GTM (não hipótese):** mensagem de aquisição é ampla desde o dia 1; volume real de onboarding no curto prazo é naturalmente limitado por falta de orçamento de tráfego pago — não há piloto restrito a 1 vertical. Sinal de dados real (295 leads, base Logos Agora): maior taxa de conversão-a-quente está em escritórios de advocacia (22%, vs ≤7% nos demais segmentos), mas isso informa priorização de conteúdo/prospecção ativa, não trava o produto a um nicho.

## Job principal

**Não perder venda por demora de resposta** (captura de receita) — job primário, mensurável, é o que vende rápido pra dono cético de PME.

Alívio/delegação do gargalo do dono é benefício secundário — reforça retenção, não é o gancho de conversão inicial.

## Hipóteses a validar

1. **Onboarding automatizado como saída de escala.** "A Iris entrevista o próprio dono" (seção "UX de captação" do planejamento) precisa funcionar bem o suficiente pra virar alternativa à camada artesanal manual quando o orçamento de tráfego crescer. Hoje mitigado: camada artesanal escrita à mão por Vinicius é aceitável porque o volume de clientes é naturalmente baixo (sem verba de ads). Revisitar quando isso deixar de ser verdade.
2. **Qualidade dos modelos chineses (GLM/Kimi/DeepSeek/MiniMax) em PT-BR coloquial de WhatsApp.** A tese de custo (tier básico em modelo custo-eficiente) só se sustenta se o agente continuar soando gente. Precisa de bateria de avaliação comparativa antes de amarrar tier a modelo — vira ADR formal na Fase 3 (divergência do stack padrão Claude/GPT-4o/Groq).
3. **Aceitação da identidade híbrida pelo cliente final.** Agente se apresenta como "assistente da [empresa]", não nega ser IA se perguntado. Validar reação de clientes reais no piloto + validação jurídica formal (CDC/LGPD/termos Meta) antes de qualquer lançamento.

## Notas de escopo (carregam pra Fase 2/3, não decidem aqui)

- Produto completo (4 personas: Atendimento/Vendas/Agendamento/SDR) é a decisão de escopo confirmada — risco nomeado: constrói-se muito antes do primeiro feedback real. Decomposition (Fase 5) deve ordenar um subconjunto vendável cedo.
- Camada artesanal manual por tenant é aceitável apenas enquanto o volume de clientes for baixo — não é decisão permanente de arquitetura, é uma bengala consciente de fase inicial.
