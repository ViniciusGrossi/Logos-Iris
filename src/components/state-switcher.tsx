"use client";

import { cn } from "@/lib/utils";

export type ScreenState = "loading" | "empty" | "content";

const options: { value: ScreenState; label: string }[] = [
  { value: "loading", label: "Carregando" },
  { value: "empty", label: "Vazio" },
  { value: "content", label: "Conteúdo" },
];

export function StateSwitcher({
  value,
  onChange,
}: {
  value: ScreenState;
  onChange: (v: ScreenState) => void;
}) {
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-border bg-bg-subtle p-1 text-xs">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={cn(
            "rounded-full px-3 py-1 duration-fast ease-out-exp transition-colors",
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
