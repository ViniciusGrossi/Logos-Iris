import { cn } from "@/lib/utils";
import type { Message } from "@/mocks/types";

export function MessageBubble({
  message,
  style,
}: {
  message: Message;
  style?: React.CSSProperties;
}) {
  const isOutbound = message.direction === "enviada";
  return (
    <div
      style={style}
      className={cn(
        "flex animate-in fade-in slide-in-from-bottom-1 duration-base ease-out-exp",
        isOutbound ? "justify-end" : "justify-start"
      )}
    >
      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-2 text-sm leading-relaxed",
          isOutbound ? "bg-bg-subtle text-foreground" : "bg-secondary text-foreground"
        )}
      >
        {message.content}
        <div className="mt-1 text-right text-[10px] text-muted-foreground">{message.sentAt}</div>
      </div>
    </div>
  );
}
