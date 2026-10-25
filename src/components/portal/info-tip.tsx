import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

// Пояснення до заголовка: кнопка-іконка «i» (ghost) з підказкою при наведенні, фокусі (Tab) чи дотику.
// Текст доступний і зчитувачам екрана через aria-label.
export function InfoTip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={<Button type="button" variant="ghost" size="icon-sm" className="text-muted-foreground" />}
        aria-label={label}
      >
        <Info aria-hidden="true" />
      </TooltipTrigger>
      <TooltipContent className="max-w-64 text-sm">{children}</TooltipContent>
    </Tooltip>
  );
}
