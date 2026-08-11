"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { Button } from "@/components/ui/button";

export interface SidebarItem {
  href: string;
  label: string;
  icon: ReactNode;
}

interface SidebarProps {
  items: SidebarItem[];
  collapsed: boolean;
  onToggle: () => void;
  footer?: ReactNode;
}

export function Sidebar({ items, collapsed, onToggle, footer }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-border bg-card transition-all duration-[var(--duration-base)] ease-[var(--ease-out-exp)]",
        collapsed ? "w-16" : "w-56"
      )}
    >
      <div className="flex h-14 items-center border-b border-border px-3">
        {!collapsed && (
          <span className="font-heading text-sm font-semibold text-foreground truncate">
            Logos Iris
          </span>
        )}
        <Button
          variant="ghost"
          size="icon"
          className={cn("size-8", collapsed ? "mx-auto" : "ml-auto")}
          onClick={onToggle}
          aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
        >
          {collapsed ? (
            <PanelLeftOpen className="size-4" />
          ) : (
            <PanelLeftClose className="size-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 space-y-1 p-2">
        {items.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(item.href + "/");
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors duration-[var(--duration-fast)]",
                isActive
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground"
              )}
            >
              <span className="size-5 shrink-0">{item.icon}</span>
              {!collapsed && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {footer && <div className="border-t border-border p-2">{footer}</div>}
    </aside>
  );
}