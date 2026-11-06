import { StatusBadge } from "@/components/portal/status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSubmittedAt } from "@/lib/purchase/date";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { formatCents, lineSumCents, totalCents } from "@/lib/purchase/money";

// Розділи сторінки заявки /requests/[id]: дані заявки, рядки з сумами, історія. Сторінка лише завантажує дані й
// вирішує, чи їх видно (ForbiddenCard); тут — лише вигляд.

type Details = {
  authorName: string;
  departmentName: string;
  purchaseType: string;
  status: string;
  rejectReason: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      {children}
    </div>
  );
}

export function RequestDetails({ authorName, departmentName, purchaseType, status, rejectReason }: Details) {
  return (
    <Card>
      <CardContent>
        <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <Field label="Author">
            <dd className="font-medium" data-testid="request-author">
              {authorName}
            </dd>
          </Field>
          <Field label="Department">
            <dd className="font-medium">{departmentName}</dd>
          </Field>
          <Field label="Purchase type">
            <dd className="font-medium">{PURCHASE_TYPE_LABEL[purchaseType as PurchaseType] ?? purchaseType}</dd>
          </Field>
          <Field label="Status">
            <dd>
              <StatusBadge status={status} />
            </dd>
          </Field>
          {status === "rejected" && rejectReason ? (
            // Причину відхилення видно поруч зі статусом автору й схвалювачам відділу — рішення PM #59 (AC-APR-07).
            <Field label="Rejection reason">
              <dd data-testid="reject-reason">{rejectReason}</dd>
            </Field>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

type Line = { position: number; name: string; purpose: string; quantity: number; price: number };

export function RequestLines({ lines }: { lines: readonly Line[] }) {
  return (
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
            <TableHead className="text-right">Price</TableHead>
            <TableHead className="pr-4 text-right">Sum, USD</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.position}>
              <TableCell className="pl-4 font-medium">{l.name}</TableCell>
              <TableCell>{l.purpose}</TableCell>
              <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(l.price).toFixed(2)}</TableCell>
              <TableCell className="pr-4 text-right tabular-nums">{formatCents(lineSumCents(l.quantity, l.price))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
        {/* Сума заявки — усі рядки, зокрема відхилені (AC-HIST-02; припущення PM у вимозі 64, відповідь на #65). */}
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="pl-4 font-medium">
              Total
            </TableCell>
            <TableCell className="pr-4 text-right font-medium tabular-nums" data-testid="request-total">
              {formatCents(totalCents(lines))}
            </TableCell>
          </TableRow>
        </TableFooter>
      </Table>
    </Card>
  );
}

// Підписи записів історії — таблиця PM (вимога 49): «Подано» → «Submitted».
const HISTORY_LABEL: Record<string, string> = { submitted: "Submitted" };

type HistoryEntry = { kind: string; actor_name: string | null; created_at: string };

// Історія заявки (AC-HIST-06): «Submitted · <ім'я> · 05.11.2026, 14:32» — підписи з таблиці PM (#49), час #74.
// Без записів картки немає (власного тексту порожнього стану PM не задавав).
export function RequestHistory({ history }: { history: readonly HistoryEntry[] }) {
  if (history.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle id="history-title">History</CardTitle>
      </CardHeader>
      <CardContent>
        <ol aria-labelledby="history-title" className="flex flex-col gap-2 text-sm" data-testid="request-history">
          {history.map((e, i) => (
            <li key={`${e.created_at}-${i}`} className="tabular-nums">
              {`${HISTORY_LABEL[e.kind] ?? e.kind} · ${e.actor_name ?? "—"} · ${formatSubmittedAt(e.created_at)}`}
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
