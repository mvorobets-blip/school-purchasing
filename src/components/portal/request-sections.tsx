import { StatusBadge } from "@/components/portal/status-badge";
import { Alert } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatSubmittedAt } from "@/lib/purchase/date";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { formatCents, lineSumCents, totalCents } from "@/lib/purchase/money";
import { LINE_STATUS_LABEL, type LineStatus } from "@/lib/purchase/status";
import { Checkbox } from "@/components/ui/checkbox";

// Розділи сторінки заявки /requests/[id]: дані заявки, рядки з сумами, історія. Сторінка лише завантажує дані й
// вирішує, чи їх видно (ForbiddenCard); тут — лише вигляд.

type Details = {
  authorName: string;
  departmentName: string;
  purchaseType: string;
  status: string;
  rejectReason: string | null;
  returnReason: string | null;
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="text-muted-foreground">{label}</dt>
      {children}
    </div>
  );
}

export function RequestDetails({ authorName, departmentName, purchaseType, status, rejectReason, returnReason }: Details) {
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
          {status === "returned" && returnReason ? (
            // Причину повернення бачить автор поруч зі статусом — що виправити (вимога 63, крок 3; AC-DEC-04).
            <Field label="Return reason">
              <dd data-testid="return-reason">{returnReason}</dd>
            </Field>
          ) : null}
        </dl>
      </CardContent>
    </Card>
  );
}

type Line = { position: number; name: string; purpose: string; quantity: number; price: number; status?: string | null };

// Вибір «Reject line» схвалювачем (AC-DEC-01) — лише на сторінці заявки «Awaiting approval», яку він може вирішити.
type Selectable = { rejected: ReadonlySet<number>; onToggle: (position: number) => void; disabled?: boolean };

const lineStatusText = (status: string | null | undefined) =>
  status && Object.hasOwn(LINE_STATUS_LABEL, status) ? LINE_STATUS_LABEL[status as LineStatus] : "—";

export function RequestLines({ lines, selectable }: { lines: readonly Line[]; selectable?: Selectable }) {
  // «Line status» — після рішення (AC-DEC-01: автор бачить «Approved» / «Rejected» у кожного рядка).
  const decided = lines.some((l) => l.status);
  const extra = (decided ? 1 : 0) + (selectable ? 1 : 0);
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
            <TableHead className={extra ? "text-right" : "pr-4 text-right"}>Sum, USD</TableHead>
            {decided ? <TableHead className={selectable ? undefined : "pr-4"}>Line status</TableHead> : null}
            {selectable ? <TableHead className="pr-4">Reject line</TableHead> : null}
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((l) => (
            <TableRow key={l.position}>
              <TableCell className="pl-4 font-medium">{l.name}</TableCell>
              <TableCell>{l.purpose}</TableCell>
              <TableCell className="text-right tabular-nums">{l.quantity}</TableCell>
              <TableCell className="text-right tabular-nums">{Number(l.price).toFixed(2)}</TableCell>
              <TableCell className={extra ? "text-right tabular-nums" : "pr-4 text-right tabular-nums"}>
                {formatCents(lineSumCents(l.quantity, l.price))}
              </TableCell>
              {decided ? (
                <TableCell className={selectable ? undefined : "pr-4"} data-testid="line-status">
                  {lineStatusText(l.status)}
                </TableCell>
              ) : null}
              {selectable ? (
                <TableCell className="pr-4">
                  <Checkbox
                    checked={selectable.rejected.has(l.position)}
                    onCheckedChange={() => selectable.onToggle(l.position)}
                    disabled={selectable.disabled}
                    aria-label={`Reject line ${l.position}: ${l.name}`}
                  />
                </TableCell>
              ) : null}
            </TableRow>
          ))}
        </TableBody>
        {/* Сума заявки — усі рядки, зокрема відхилені (AC-HIST-02; припущення PM у вимозі 64, відповідь на #65). */}
        <TableFooter>
          <TableRow>
            <TableCell colSpan={4} className="pl-4 font-medium">
              Total
            </TableCell>
            <TableCell className={extra ? "text-right font-medium tabular-nums" : "pr-4 text-right font-medium tabular-nums"} data-testid="request-total">
              {formatCents(totalCents(lines))}
            </TableCell>
            {extra ? <TableCell colSpan={extra} /> : null}
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
export function RequestHistory({ history, failed = false }: { history: readonly HistoryEntry[]; failed?: boolean }) {
  if (!failed && history.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle id="history-title">History</CardTitle>
      </CardHeader>
      <CardContent>
        {failed ? (
          // Помилка завантаження — повідомлення, а не порожній список (DESIGN.md §6); решта сторінки лишається.
          <Alert variant="destructive" data-testid="history-error">
            Could not load the history. Refresh the page.
          </Alert>
        ) : null}
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
