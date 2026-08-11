"use client";

import { type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface FilterOption {
  value: string;
  label: string;
}

interface FilterBarProps {
  searchPlaceholder?: string;
  searchValue: string;
  onSearchChange: (value: string) => void;
  filters?: {
    key: string;
    label: string;
    options: FilterOption[];
    value: string;
    onChange: (value: string) => void;
  }[];
  children?: ReactNode;
  className?: string;
}

export function FilterBar({
  searchPlaceholder = "Buscar...",
  searchValue,
  onSearchChange,
  filters,
  children,
  className,
}: FilterBarProps) {
  const hasActiveFilters =
    searchValue.length > 0 || (filters?.some((f) => f.value !== "all") ?? false);

  return (
    <div className={cn("flex flex-wrap items-center gap-3", className)}>
      <div className="relative flex-1 min-w-48 max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder={searchPlaceholder}
          value={searchValue}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9"
        />
        {searchValue && (
          <button
            onClick={() => onSearchChange("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Limpar busca"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {filters?.map((filter) => (
        <Select key={filter.key} value={filter.value} onValueChange={(v) => filter.onChange(v ?? "all")}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder={filter.label} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {filter.options.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ))}

      {hasActiveFilters && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            onSearchChange("");
            filters?.forEach((f) => f.onChange("all"));
          }}
          className="text-muted-foreground"
        >
          Limpar filtros
        </Button>
      )}

      {children}
    </div>
  );
}