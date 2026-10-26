import type { LucideIcon } from "lucide-react";
import { Building2 } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusBadge } from "@/components/portal/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

// Будівельні блоки головної (DESIGN.md, «Каркас порталу» → «Головна»): лише компоненти @/components/ui і токени.

// Картка-число. З href уся картка — посилання з видимим фокусом; без href — просто число (немає сторінки-списку).
export function StatLink({
  href,
  icon: Icon,
  iconClass,
  label,
  value,
  hint,
  testId,
}: {
  href?: string;
  icon: LucideIcon;
  iconClass: string;
  label: string;
  value: number;
  hint: string;
  testId?: string;
}) {
  const card = (
    <Card className="h-full transition-shadow group-hover:ring-input">
      <CardContent className="flex flex-col gap-1">
        <span className="flex flex-col items-start gap-1.5 text-sm text-muted-foreground sm:flex-row sm:items-center sm:gap-2">
          <span className={cn("flex size-7 items-center justify-center rounded-lg", iconClass)}>
            <Icon className="size-4" aria-hidden="true" />
          </span>
          {label}
        </span>
        <span data-testid={testId} className="text-2xl font-semibold tabular-nums sm:text-3xl">
          {value}
        </span>
        <span className="hidden text-sm text-muted-foreground sm:block">{hint}</span>
      </CardContent>
    </Card>
  );
  if (!href) return card;
  return (
    <Link href={href} className="group rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
      {card}
    </Link>
  );
}

// Картка-розділ із заголовком і необов'язковим посиланням праворуч («All my requests», «Profile»).
export function SectionCard({
  title,
  link,
  children,
  testId,
}: {
  title: string;
  link?: { href: string; label: string };
  children: ReactNode;
  testId?: string;
}) {
  return (
    <Card data-testid={testId}>
      <CardHeader className="flex items-center gap-2">
        <CardTitle className="flex-1">
          <h2>{title}</h2>
        </CardTitle>
        {link ? (
          <Link
            href={link.href}
            className="-my-2 inline-flex min-h-10 items-center rounded-md px-1 text-sm font-medium text-accent-foreground outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {link.label}
          </Link>
        ) : null}
      </CardHeader>
      <CardContent className="flex flex-col">{children}</CardContent>
    </Card>
  );
}

// Рядок заявки: перша позиція («Папір А4 + 2 more»), відділ, тип, дата й статус; для відхиленої — причина (AC-APR-07).
export function RequestRow({
  href,
  title,
  more,
  meta,
  status,
  rejectReason,
}: {
  href: string;
  title: string;
  more: number;
  meta: ReactNode;
  status: string;
  rejectReason?: string | null;
}) {
  return (
    <Link
      href={href}
      data-testid="dashboard-request"
      className="-mx-2 grid grid-cols-[1fr_auto] gap-x-3 gap-y-0.5 rounded-lg border-t px-2 py-2.5 outline-none first:border-t-0 hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="font-medium">
        {title}
        {more > 0 ? <span className="font-normal text-muted-foreground"> + {more} more</span> : null}
      </span>
      <span className="row-span-2 self-center">
        <StatusBadge status={status} />
      </span>
      <span className="text-sm text-muted-foreground">{meta}</span>
      {status === "rejected" && rejectReason ? (
        <span className="col-span-2 mt-0.5 border-l-2 border-border pl-2 text-sm text-muted-foreground">
          Rejection reason: {rejectReason}
        </span>
      ) : null}
    </Link>
  );
}

// Рядок відділу з іконкою-чипом і міткою праворуч (роль у відділі, «No approver», число).
export function DepartmentRow({ href, name, note, aside }: { href: string; name: string; note?: string; aside: ReactNode }) {
  return (
    <Link
      href={href}
      className="-mx-2 flex items-center gap-3 rounded-lg p-2 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground">
        <Building2 className="size-4" aria-hidden="true" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{name}</span>
        {note ? <span className="text-sm text-muted-foreground">{note}</span> : null}
      </span>
      {aside}
    </Link>
  );
}
