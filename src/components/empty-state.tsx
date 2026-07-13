export function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
      <p className="max-w-xs text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
