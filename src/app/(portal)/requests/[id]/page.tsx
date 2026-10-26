import Link from "next/link";
import { redirect } from "next/navigation";
import { StatusBadge } from "@/components/portal/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Сторінка заявки. Бачать автор, схвалювач її відділу й адміністратор (RLS). Іншим — «Not enough permissions» без даних:
// не розрізняємо «немає» й «чужа», щоб не розкривати вміст (AC-FRM-08, AC-APR-03).
export default async function RequestPage({ params }: PageProps<"/requests/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const forbidden = (
    <div className="flex flex-col gap-4">
      <Alert data-testid="forbidden">{messageFor("FORBIDDEN")}</Alert>
      <Link href="/requests" className="text-sm underline">
        Back to my requests
      </Link>
    </div>
  );
  if (!UUID.test(id)) return forbidden;

  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("purchase_requests")
    .select("id, department_id, purchase_type, status, reject_reason, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  if (!request) return forbidden;

  const [linesRes, deptRes] = await Promise.all([
    supabase
      .from("purchase_request_lines")
      .select("position, name, purpose, quantity, price")
      .eq("request_id", id)
      .order("position"),
    supabase.from("departments").select("name").eq("id", request.department_id).maybeSingle(),
  ]);
  // Помилка завантаження рядків чи відділу — повідомлення, а не порожня таблиця (DESIGN.md §6).
  if (linesRes.error || deptRes.error) {
    return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <Link href="/requests" className="text-sm text-muted-foreground hover:text-foreground">
          ← My requests
        </Link>
        <h1 className="text-2xl font-semibold">Purchase</h1>
      </div>

      <Card>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Department</dt>
              <dd className="font-medium">{deptRes.data?.name ?? "—"}</dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Purchase type</dt>
              <dd className="font-medium">
                {PURCHASE_TYPE_LABEL[request.purchase_type as PurchaseType] ?? request.purchase_type}
              </dd>
            </div>
            <div className="flex flex-col gap-1">
              <dt className="text-muted-foreground">Status</dt>
              <dd>
                <StatusBadge status={request.status} />
              </dd>
            </div>
            {request.status === "rejected" && request.reject_reason ? (
              // Причину відхилення видно поруч зі статусом — припущення розробника за питанням PM #59 (AC-APR-07).
              <div className="flex flex-col gap-1">
                <dt className="text-muted-foreground">Rejection reason</dt>
                <dd data-testid="reject-reason">{request.reject_reason}</dd>
              </div>
            ) : null}
          </dl>
        </CardContent>
      </Card>

      <Card className="pb-0">
        <CardHeader>
          <CardTitle>Lines</CardTitle>
        </CardHeader>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="pl-4">Item</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead className="text-right">Quantity</TableHead>
              <TableHead className="pr-4 text-right">Price</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(linesRes.data ?? []).map((l) => (
              <TableRow key={l.position}>
                <TableCell className="pl-4 font-medium">{l.name}</TableCell>
                <TableCell>{l.purpose}</TableCell>
                <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
                <TableCell className="pr-4 text-right tabular-nums">{Number(l.price).toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
    </>
  );
}
