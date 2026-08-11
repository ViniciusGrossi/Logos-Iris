"use client";

import { type ReactNode, useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui-shared/empty-state";

export interface DataTableColumn<T> {
  key: string;
  header: string;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  className?: string;
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  data: T[];
  pageSize?: number;
  emptyTitle?: string;
  emptyDescription?: string;
  rowKey: (row: T) => string;
}

type SortDir = "asc" | "desc" | null;

export function DataTable<T>({
  columns,
  data,
  pageSize = 10,
  emptyTitle = "Nenhum registro encontrado",
  emptyDescription,
  rowKey,
}: DataTableProps<T>) {
  const [page, setPage] = useState(0);
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    return [...data].sort((a, b) => {
      const col = columns.find((c) => c.key === sortKey);
      if (!col) return 0;
      const aVal = (a as Record<string, unknown>)[sortKey];
      const bVal = (b as Record<string, unknown>)[sortKey];
      const aStr = String(aVal ?? "");
      const bStr = String(bVal ?? "");
      const cmp = aStr.localeCompare(bStr, "pt-BR", { numeric: true });
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages - 1);
  const pageData = sorted.slice(safePage * pageSize, (safePage + 1) * pageSize);

  const handleSort = (key: string) => {
    if (sortKey === key) {
      if (sortDir === "asc") setSortDir("desc");
      else if (sortDir === "desc") {
        setSortKey(null);
        setSortDir(null);
      }
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPage(0);
  };

  const SortIcon = ({ colKey }: { colKey: string }) => {
    if (sortKey !== colKey) return <ArrowUpDown className="ml-1 size-3 text-muted-foreground/50" />;
    if (sortDir === "asc") return <ArrowUp className="ml-1 size-3" />;
    return <ArrowDown className="ml-1 size-3" />;
  };

  if (data.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />;
  }

  return (
    <div className="space-y-3">
      <div className="overflow-x-auto rounded-lg border border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead
                  key={col.key}
                  className={cn(
                    col.align === "right" && "text-right",
                    col.align === "center" && "text-center",
                    col.sortable && "cursor-pointer select-none",
                    col.className
                  )}
                  onClick={() => col.sortable && handleSort(col.key)}
                >
                  <span className="inline-flex items-center gap-1">
                    {col.header}
                    {col.sortable && <SortIcon colKey={col.key} />}
                  </span>
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageData.map((row) => (
              <TableRow key={rowKey(row)}>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    className={cn(
                      col.align === "right" && "text-right",
                      col.align === "center" && "text-center",
                      col.className
                    )}
                  >
                    {col.render(row)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            {safePage * pageSize + 1}–{Math.min((safePage + 1) * pageSize, sorted.length)} de{" "}
            {sorted.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={safePage === 0}
              onClick={() => setPage((p) => Math.max(0, p - 1))}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <span className="min-w-8 text-center tabular-nums">
              {safePage + 1}/{totalPages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-8"
              disabled={safePage >= totalPages - 1}
              onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}