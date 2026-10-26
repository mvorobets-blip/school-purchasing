import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Посилання «назад» над заголовком сторінки (DESIGN.md §5): кнопка `ghost` зі стрілкою — тиха, доки не наведено;
// `-ml-3`, щоб текст стояв на одній лінії із заголовком.
export function BackLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={cn(buttonVariants({ variant: "ghost", className: "-ml-3 w-fit text-muted-foreground" }))}>
      <ArrowLeft aria-hidden="true" />
      {children}
    </Link>
  );
}
