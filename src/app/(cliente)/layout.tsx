import Link from "next/link";

export default function ClienteLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 md:px-6">
        <span className="font-heading text-lg">Logos Iris</span>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/inbox" className="text-foreground hover:text-muted-foreground">
            Conversas
          </Link>
          <Link href="/dashboard" className="text-foreground hover:text-muted-foreground">
            Resumo do dia
          </Link>
        </nav>
      </header>
      <div className="min-h-0 flex-1">{children}</div>
    </div>
  );
}
