import { Check, Minus } from "lucide-react";
import type { TypeAccess } from "@/lib/org/permissions";

// Список типів заявок чи закупівлі з позначкою «дозволено / ні» — власний профіль і профіль працівника для адміністратора.
export function AccessList({ items }: { items: TypeAccess[] }) {
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {items.map((t) => (
        <li key={t.label} className="flex items-center gap-2">
          {t.allowed ? (
            <Check className="size-4 text-accent-foreground" aria-hidden="true" />
          ) : (
            <Minus className="size-4 text-muted-foreground" aria-hidden="true" />
          )}
          <span className={t.allowed ? "" : "text-muted-foreground"}>{t.label}</span>
          <span className="sr-only">{t.allowed ? "— allowed" : "— not allowed"}</span>
        </li>
      ))}
    </ul>
  );
}
