import { cn } from "@/lib/utils";

const statusClass: Record<string, string> = {
  ativo: "bg-status-ok",
  ativa: "bg-status-ok",
  pausado: "bg-status-idle",
  pausada: "bg-status-idle",
  cancelado: "bg-status-off",
  encerrada: "bg-status-off",
};

export function StatusDot({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn("inline-block size-2 shrink-0 rounded-full", statusClass[status] ?? "bg-status-off", className)}
      aria-hidden
    />
  );
}
