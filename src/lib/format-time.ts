// Logos Iris — formatação de horário curto pro Inbox/Dashboard (painel-cliente-v1).
// "HH:MM" se for hoje, "dd/mm" caso contrário — mesmo vocabulário visual do protótipo da Fase 4
// (não recria o desenho, só troca timestamps mock por reais).

export function formatShortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";

  const now = new Date();
  const isToday =
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate();

  if (isToday) {
    return date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}
