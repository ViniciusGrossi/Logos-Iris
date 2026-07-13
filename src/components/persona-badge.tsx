import { Badge } from "@/components/ui/badge";
import { PERSONA_LABEL, type Persona } from "@/mocks/types";
import { cn } from "@/lib/utils";

const personaClass: Record<Persona, string> = {
  atendimento: "bg-atendimento/10 text-atendimento",
  vendas: "bg-vendas/10 text-vendas",
  agendamento: "bg-agendamento/10 text-agendamento",
  sdr: "bg-sdr/10 text-sdr",
};

export function PersonaBadge({
  persona,
  className,
}: {
  persona: Persona;
  className?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("border-transparent font-medium", personaClass[persona], className)}
    >
      {PERSONA_LABEL[persona]}
    </Badge>
  );
}
