import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function MetricCard({
  label,
  value,
  size = "default",
  style,
}: {
  label: string;
  value: number | string;
  size?: "default" | "lg";
  style?: React.CSSProperties;
}) {
  return (
    <Card style={style}>
      <CardContent>
        <div className={cn("font-heading leading-none", size === "lg" ? "text-5xl" : "text-3xl")}>
          {value}
        </div>
        <div className="mt-2 text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
