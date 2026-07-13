"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StatusDot } from "@/components/status-dot";
import { EmptyState } from "@/components/empty-state";
import { StateSwitcher, type ScreenState } from "@/components/state-switcher";
import { tenants } from "@/mocks/tenants";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 5;
const PLANOS = ["Básico", "Premium", "Setor Público"] as const;
const STATUSES = ["ativo", "pausado", "cancelado"] as const;

export default function AdminTenantsPage() {
  const [screenState, setScreenState] = useState<ScreenState>("content");
  const [plano, setPlano] = useState<string>("todos");
  const [status, setStatus] = useState<string>("todos");
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    return tenants.filter(
      (t) => (plano === "todos" || t.plano === plano) && (status === "todos" || t.status === status)
    );
  }, [plano, status]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function handleFilterChange(setter: (v: string) => void) {
    return (v: string | null) => {
      setter(v ?? "todos");
      setPage(1);
    };
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6 md:px-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-heading text-xl">Lista de tenants</h1>
        <StateSwitcher value={screenState} onChange={setScreenState} />
      </div>

      <div className="mb-4 flex items-center gap-2">
        <Select value={plano} onValueChange={handleFilterChange(setPlano)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Plano" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os planos</SelectItem>
            {PLANOS.map((p) => (
              <SelectItem key={p} value={p}>
                {p}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={status} onValueChange={handleFilterChange(setStatus)}>
          <SelectTrigger size="sm" className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todos">Todos os status</SelectItem>
            {STATUSES.map((s) => (
              <SelectItem key={s} value={s} className="capitalize">
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {screenState === "loading" && (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      )}

      {screenState === "empty" && <EmptyState message="Nenhum tenant cadastrado." />}

      {screenState === "content" && (
        <>
          <div className="rounded-lg border border-border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tenant</TableHead>
                  <TableHead>Plano</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Conversas/mês</TableHead>
                  <TableHead>Uso</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum tenant corresponde aos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  paged.map((t, i) => {
                    const usage = t.conversasNoMes / t.limiteConversas;
                    return (
                      <TableRow
                        key={t.id}
                        style={{ animationDelay: `${i * 40}ms` }}
                        className="animate-in fade-in slide-in-from-bottom-1 duration-base ease-out-exp hover:-translate-y-px hover:shadow-sm"
                      >
                        <TableCell className="font-medium">{t.nome}</TableCell>
                        <TableCell className="text-muted-foreground">{t.plano}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1.5 capitalize">
                            <StatusDot status={t.status} />
                            {t.status}
                          </div>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{t.conversasNoMes}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-bg-subtle">
                              <div
                                className={cn(
                                  "h-full rounded-full duration-[600ms] ease-out-exp",
                                  usage >= 0.9 ? "bg-destructive" : "bg-foreground"
                                )}
                                style={{
                                  width: `${Math.min(100, usage * 100)}%`,
                                  transitionDelay: `${i * 40}ms`,
                                }}
                              />
                            </div>
                            <span className="shrink-0 text-xs text-muted-foreground">
                              {t.conversasNoMes}/{t.limiteConversas}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="sm">
                            {t.status === "ativo" ? "Pausar" : "Ver"}
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>

          <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
            <span>
              Página {page} de {totalPages} · {filtered.length} tenants
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Próxima
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
