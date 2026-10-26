import { Inbox } from "lucide-react";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/portal/status-badge";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { CLICKABLE_ROW, RowLink, ROW_ACTIONS } from "@/components/portal/row-link";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { getAwaitingDecision } from "@/lib/purchase/awaiting";
import { formatSubmitted } from "@/lib/purchase/date";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";
import { DecisionButtons } from "./decision-buttons";

const OK_TEXT: Record<string, string> = { APPROVED: "Request approved.", REJECTED: "Request rejected." };

// Список для рішення: подані заявки відділів, які людина схвалює, крім власних (AC-APR-01; матриця прав).
// Хто не схвалює жодного відділу — «Not enough permissions» без жодної заявки (AC-APR-04).
export default async function ApprovalsPage({ searchParams }: PageProps<"/approvals">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { ok } = await searchParams;

  // Ті самі умови й запити, що й лічильник у бічній панелі (getAwaitingDecision): список і число не розійдуться.
  const awaiting = await getAwaitingDecision(user.id);
  if (awaiting.failed) return <Alert variant="destructive">Could not load requests. Refresh the page.</Alert>;

  if (awaiting.departmentIds.length === 0) {
    return (
      <>
        <h1 className="text-2xl font-semibold">Awaiting decision</h1>
        <ForbiddenCard hint="Only approvers see requests awaiting a decision." backHref="/" backLabel="Back to home" />
      </>
    );
  }

  const supabase = await createClient();
  const deptsRes = await supabase.from("departments").select("id, name");
  if (deptsRes.error) return <Alert variant="destructive">Could not load requests. Refresh the page.</Alert>;
  const names = new Map(deptsRes.data.map((d) => [d.id, d.name]));
  const requests = awaiting.requests;
  // Хто подав: лише ім'я й лише для заявок, які схвалювач бачить (private.request_author_names) — профілі колег закриті.
  const authorsRes = requests.length
    ? await supabase.rpc("request_author_names", { p_request_ids: requests.map((r) => r.id) })
    : null;
  const authorOf = new Map((authorsRes?.data ?? []).map((a) => [a.request_id, a.author_name]));

  return (
    <>
      <h1 className="text-2xl font-semibold">Awaiting decision</h1>

      {typeof ok === "string" && Object.hasOwn(OK_TEXT, ok) ? (
        <Alert role="status" data-testid="decision-message">
          {OK_TEXT[ok]}
        </Alert>
      ) : null}

      {requests.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 py-8 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-accent text-accent-foreground">
              <Inbox className="size-5" aria-hidden="true" />
            </span>
            <p className="font-medium" data-testid="no-decisions">
              {messageFor("NO_DECISIONS")}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Card className="py-0">
          <Table data-testid="decision-list">
            <TableHeader>
              <TableRow>
                <TableHead className="pl-4">Submitted</TableHead>
                <TableHead>Author</TableHead>
                <TableHead>Department</TableHead>
                <TableHead>Purchase type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="pr-4 text-right">Decision</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {requests.map((r) => {
                const submitted = formatSubmitted(r.created_at);
                const department = names.get(r.department_id) ?? "—";
                return (
                  <TableRow key={r.id} data-testid="decision-row" className={cn("group", CLICKABLE_ROW)}>
                    <TableCell className="pl-4 tabular-nums">
                      <RowLink href={`/requests/${r.id}`} className="font-medium group-hover:text-accent-foreground">
                        {submitted}
                      </RowLink>
                    </TableCell>
                    <TableCell data-testid="decision-author">{authorOf.get(r.id) ?? "—"}</TableCell>
                    <TableCell>{department}</TableCell>
                    <TableCell>{PURCHASE_TYPE_LABEL[r.purchase_type as PurchaseType] ?? r.purchase_type}</TableCell>
                    <TableCell>
                      <StatusBadge status="pending" />
                    </TableCell>
                    <TableCell className={cn("pr-4", ROW_ACTIONS)}>
                      <DecisionButtons requestId={r.id} label={`${department}, ${submitted}`} />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </Card>
      )}
    </>
  );
}
