export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col bg-bg-subtle">
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background px-4 py-2.5 md:px-6">
        <span className="font-heading text-base">Logos Iris</span>
        <span className="rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground">
          Admin
        </span>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
    </div>
  );
}
