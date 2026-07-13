import type { DailySignal } from "./types";

export const dailySignals: DailySignal[] = [
  {
    id: "s1",
    type: "orcamento",
    persona: "vendas",
    description: "Orçamento de pacote 6 sessões gerado para Marcelo Andrade",
    conversationId: "c1",
    time: "09:42",
  },
  {
    id: "s2",
    type: "agendamento",
    persona: "agendamento",
    description: "Confirmação de horário — Juliana Ferraz, quinta 15h",
    conversationId: "c2",
    time: "09:15",
  },
  {
    id: "s3",
    type: "fora_catalogo",
    persona: "atendimento",
    description: "Pergunta fora do catálogo: entrega fora de São Paulo",
    conversationId: "c3",
    time: "08:58",
  },
  {
    id: "s4",
    type: "lead_quente",
    persona: "sdr",
    description: "Lead quente via anúncio — Ricardo Sales, aguardando resposta",
    conversationId: "c4",
    time: "08:30",
  },
];

export const dashboardTotals = {
  conversas: 23,
  orcamentos: 4,
  agendamentos: 2,
  foraDoCatalogo: 1,
};
