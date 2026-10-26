import { ArrowLeft, Lock } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { messageFor } from "@/lib/org/messages";
import { cn } from "@/lib/utils";

// Відмова в доступі (DESIGN.md §6): картка по центру, нейтральна (не червона — людина нічого не зламала), текст PM
// «Not enough permissions» і коротке пояснення правила без жодних даних (AC-LANG-03); одна дія — повернутися назад
// кнопкою `outline`.
export function ForbiddenCard({ hint, backHref, backLabel }: { hint: string; backHref: string; backLabel: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-8">
      <Card className="w-full max-w-md" role="alert" data-testid="forbidden">
        <CardContent className="flex flex-col items-center gap-3 py-6 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
            <Lock className="size-5" aria-hidden="true" />
          </span>
          <p className="text-lg font-medium">{messageFor("FORBIDDEN")}</p>
          <p className="max-w-xs text-sm text-muted-foreground">{hint}</p>
          <Link href={backHref} className={cn(buttonVariants({ variant: "outline", className: "mt-2" }))}>
            <ArrowLeft aria-hidden="true" />
            {backLabel}
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
