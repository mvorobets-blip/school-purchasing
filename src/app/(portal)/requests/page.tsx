import { ChevronRight, ListChecks, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/portal/status-badge";
import { CLICKABLE_ROW, RowLink } from "@/components/portal/row-link";
import { Alert } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { formatSubmitted } from "@/lib/purchase/date";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

// «Мої заявки»: лише власні заявки зі статусами (AC-FRM-10), «Purchase submitted» після подання (AC-FRM-11),
// порожній стан «You have not submitted any requests yet» (AC-FRM-14). Умова author_id + RLS: чужих рядків база не віддає.
export default async function MyRequestsPage({ searchParams }: PageProps<"/requests">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { ok } = await searchParams;

  const supabase = await createClient();
  const [requestsRes, deptsRes] = await Promise.all([
    supabase
      .from("purchase_requests")
      .select("id, department_id, purchase_type, status, created_at")
      .eq("author_id", user.id)
      .order("created_at", { ascending: false }),
    supabase.from("departments").select("id, name"),
  ]);
  if (requestsRes.error || deptsRes.error) {
    return <Alert variant="destructive">Could not load requests. Refresh the page.</Alert>;
  }
  const names = new Map(deptsRes.data.map((d) => [d.id, d.name]));
  const requests = requestsRes.data;

  return (
    <>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="flex-1 text-2xl font-semibold">My requests</h1>
        <Link href="/requests/new" className={cn(buttonVariants())}>
          <Plus aria-hidden="true" />
          New purchase
        </Link>
      </div>

      {ok === "SUBMITTED" ? (
        <Alert role="status" data-testid="purchase-message">
          {messageFor("SUBMITTED")}
        </Alert>
      ) : null}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <ListChecks className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium" data-testid="no-requests">
              {messageFor("NO_REQUESTS")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table data-testid="my-requests">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Submitted</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Purchase type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-10 pr-4">
                  <span className="sr-only">Open</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => (
                <TableRow key={r.id} data-testid="request-row" className={cn("group", CLICKABLE_ROW)}>
                  <TableCell className="pl-4 tabular-nums">
                    <RowLink href={`/requests/${r.id}`} className="font-medium group-hover:text-accent-foreground">
                      {formatSubmitted(r.created_at)}
                    </RowLink>
                  </TableCell>
                  <TableCell>{names.get(r.department_id) ?? "—"}</TableCell>
                  <TableCell>{PURCHASE_TYPE_LABEL[r.purchase_type as PurchaseType] ?? r.purchase_type}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell className="pr-4 text-right">
                    <ChevronRight className="ml-auto size-4 text-muted-foreground group-hover:text-foreground" aria-hidden="true" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
