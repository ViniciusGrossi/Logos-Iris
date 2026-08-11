import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/** Skeleton para linha de tabela — altura consistente com DataTable. */
export function TableRowSkeleton({ cols = 4 }: { cols?: number }) {
  return (
    <div className="flex items-center gap-4 px-4 py-3" aria-hidden>
      {Array.from({ length: cols }).map((_, i) => (
        <Skeleton
          key={i}
          className={cn("h-4", i === 0 ? "w-32" : i === cols - 1 ? "w-20 ml-auto" : "flex-1")}
        />
      ))}
    </div>
  );
}

/** Skeleton de tabela completa — N linhas + header fantasma. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-1" role="status" aria-label="Carregando tabela">
      {/* header fantasma */}
      <div className="flex items-center gap-4 border-b border-border px-4 py-2">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className={cn("h-3 w-20", i === cols - 1 && "ml-auto")} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <TableRowSkeleton key={i} cols={cols} />
      ))}
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

/** Skeleton de card — placeholder para KPICard ou Card genérico. */
export function CardSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn("space-y-3 rounded-lg border border-border p-4", className)} role="status" aria-label="Carregando card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-8 w-16" />
      <span className="sr-only">Carregando...</span>
    </div>
  );
}

/** Grid de N cards skeleton — usado em dashboards. */
export function CardGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Carregando métricas">
      {Array.from({ length: count }).map((_, i) => (
        <CardSkeleton key={i} />
      ))}
    </div>
  );
}