# Logos Iris — Design System

> Fase 4. Direção: saas-premium → `/frontend-design:frontend-design`.

## Referências analisadas

`docs/design-refs/` está vazia — sem arquivos externos (Vinicius optou por não trazer refs). Fonte de referência: `docs/planejamento-fable.md` seção 6 ("Design system — reescrito pós-auditoria anti-slop"), único insumo de design pré-existente do projeto.

Extraído de lá:
- **Espectro funcional como taxonomia, não decoração** — cada persona (Atendimento, Vendas, Agendamento, SDR) tem cor própria, usada só em badge/chip/filtro/gráfico.
- **Anti-slop bans**: roxo-índigo "AI purple", cream/off-white como default, gradiente, shimmer.
- **Hipótese de cena**: dono de PME olhando o painel no celular entre um cliente e outro — luz de loja/consultório, pressa, ansiedade. Busca alívio, não imersão → tema claro, alta legibilidade, densidade média, cor restrita (neutros + espectro funcional ≤10% da superfície).
- **Tipografia candidata**: Spectral (serifada) como display, pareada com sans para UI.

Direção aprovada por Vinicius: **"Manhã Clara — restrained"** (tema claro primeiro; dark mode arquitetado agora, valores depois).

## Tokens (`globals.css` — Tailwind v4 CSS-first, `@theme`)

```css
@theme {
  /* superfícies */
  --color-bg: #FFFFFF;
  --color-bg-subtle: #F7F7F5;
  --color-border: #E4E4E1;
  --color-text: #1A1A1A;
  --color-text-muted: #6B6B66;

  /* espectro funcional — SÓ badge/chip/filtro/gráfico, nunca decoração */
  --color-atendimento: #2E7D6B;
  --color-vendas: #C0562B;
  --color-agendamento: #3A5A9E;
  --color-sdr: #9C6B2E;

  /* tipografia */
  --font-display: "Spectral", serif;
  --font-ui: "Hanken Grotesk", sans-serif;

  /* spacing scale 4px base */
  --spacing-1: 0.25rem; --spacing-2: 0.5rem; --spacing-4: 1rem;
  --spacing-6: 1.5rem; --spacing-8: 2rem; --spacing-12: 3rem;

  /* motion — ease-out exponencial, sem bounce */
  --ease-out-exp: cubic-bezier(0.16, 1, 0.3, 1);
  --duration-fast: 150ms; --duration-base: 250ms;
}
```

**Dark mode**: mesmos slots de token, valores trocados depois via `:root[data-theme="dark"]`. Arquitetura preparada agora — não construir valores ainda (decisão explícita: light primeiro).

**Regra de uso do espectro**: nunca em bubble de mensagem, nunca em background de card, nunca em botão primário. Só metadata (badge de persona, status dot de dado quando fizer sentido, filtro).

## Telas do protótipo (3 — Fase 4 gate)

Escopo aprovado: Painel Cliente (Inbox + Dashboard) + Painel Admin (Lista de tenants). Playground e Enriquecimento ficam fora do protótipo de Fase 4 (não são core pro handshake visual).

### 1. Inbox (conversas ao vivo)

- Layout desktop: sidebar 320px fixa (lista de conversas) + painel de conversa à direita.
- Mobile (375px): lista full-screen → tap abre conversa full-screen (nunca split comprimido).
- Item da lista: avatar/inicial, nome, preview da última mensagem, timestamp, badge de agente (cor do espectro = persona ativa), indicador de não-lida.
- Header da conversa: nome do contato + badge de agente + botão **"Pausar"** (handoff manual — [[ADR-029]] fromMe/auto-pausa).
- Bubbles: estética WhatsApp-like. Cliente à esquerda cinza-claro, Iris à direita tom bg-subtle. **Nunca** cor do espectro na bubble — cor é metadata, não decoração.
- "Iris pensando": não é three-dots genérico — pulso suave de opacidade na cor do agente ativo (150-250ms ease-out).
- Estados: loading (skeleton 4 linhas) · empty ("Nenhuma conversa ainda. Assim que alguém chamar, eu te mostro aqui.") · conteúdo.

### 2. Dashboard (resumo diário)

- Feature-assinatura do fable (seção 4): "hoje 23 conversas, 4 orçamentos, 2 agendamentos, 1 pediu algo fora do catálogo".
- Metric cards no topo: número grande em Spectral, label em Hanken Grotesk. Hierarquia: 1 métrica primária maior + 3 secundárias menores — não hero-metric genérico.
- Abaixo: lista "sinais do dia" (orçamento gerado, lead quente, intenção de agendamento) — cada linha com badge de tipo (cor do espectro) + link pra conversa de origem.
- Sem gráfico de linha/pizza decorativo — números diretos, alinhado à cena "pressa" do fable.
- Estados: loading (skeleton cards) · empty ("Ainda sem sinais hoje") · conteúdo.

### 3. Admin — Lista de tenants

- Tabela densa (não cards): nome do tenant, plano, status (ativo/pausado — dot neutro verde/cinza, **não** cor do espectro), contagem de conversas do mês, barra fina uso-vs-limite, ação rápida (pausar/ver).
- Contexto operacional, não emocional — mais compacto que as telas do Cliente, densidade alta intencional.
- Filtro por plano/status no topo. Paginação obrigatória (regra global).
- Estados: loading (row skeletons) · empty ("Nenhum tenant cadastrado") · conteúdo.

## Componentes compartilhados

`Badge` (cor por persona) · `Avatar` · `MessageBubble` · `MetricCard` · `SkeletonRow` · `EmptyState` · `StatusDot`.

Base: Shadcn UI. Tokens aplicados via className — zero cor hardcoded.

## Motion

- Ease-out exponencial em toda transição de entrada/hover.
- Dashboard: cards entram com stagger de 80ms.
- `prefers-reduced-motion` respeitado via media query CSS.
- Sem scroll-scrub/parallax — não é landing page.

## Pendências desta fase

- Scaffold Next.js 15 ainda não existe no projeto — próximo passo.
- Valores de dark mode — arquitetura de tokens pronta, valores ficam pra depois (decisão explícita de Vinicius).
