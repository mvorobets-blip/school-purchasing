import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

// Увесь рядок таблиці клікабельний (DESIGN.md §5, «Table»): одне справжнє посилання в першій клітинці, його область
// розтягнуто на весь рядок (`after:inset-0`). Клавіатура й читач екрана бачать одне посилання; кнопки в рядку
// (наприклад, «Approve» / «Reject») ставимо над ним через ROW_ACTIONS.
export const CLICKABLE_ROW = "relative cursor-pointer has-[a[data-row-link]:focus-visible]:bg-muted/50";
export const ROW_ACTIONS = "relative z-10";

export function RowLink({ className, ...props }: ComponentProps<typeof Link>) {
  return (
    <Link
      data-row-link=""
      className={cn(
        "outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-ring",
        className,
      )}
      {...props}
    />
  );
}
