import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { PAGE_SIZE, pageCount } from "@/lib/purchase/pagination";
import { cn } from "@/lib/utils";

// «Showing 51–100 of 120» і «Previous / Next» (outline) під списком; одна сторінка — нічого не показуємо.
export function Pagination({ page, total, href }: { page: number; total: number; href: (page: number) => string }) {
  const pages = pageCount(total);
  if (pages <= 1) return null;
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, total);
  const link = (target: number, label: string, icon: React.ReactNode, enabled: boolean) =>
    enabled ? (
      <Link href={href(target)} className={cn(buttonVariants({ variant: "outline" }))}>
        {icon}
        {label}
      </Link>
    ) : (
      <span aria-disabled="true" className={cn(buttonVariants({ variant: "outline" }), "pointer-events-none opacity-50")}>
        {icon}
        {label}
      </span>
    );

  return (
    <nav aria-label="Pages" className="flex flex-wrap items-center justify-between gap-3" data-testid="pagination">
      <p className="text-sm text-muted-foreground tabular-nums">
        Showing {first}–{last} of {total}
      </p>
      <div className="flex gap-2">
        {link(page - 1, "Previous", <ChevronLeft aria-hidden="true" />, page > 1)}
        {link(page + 1, "Next", <ChevronRight aria-hidden="true" />, page < pages)}
      </div>
    </nav>
  );
}
