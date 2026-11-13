"use client";

import { useActionState, useEffect, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { messageFor } from "@/lib/org/messages";
import { REASON_LIMIT } from "@/lib/purchase/form";
import { decidePurchase, type DecisionState } from "./actions";

const idle: DecisionState = { status: "idle", message: "" };

type ReasonDecision = "reject" | "return";

const REASON_DIALOG: Record<
  ReasonDecision,
  { trigger: string; title: string; variant: "destructive" | "outline"; submit: string; pending: string }
> = {
  // «Reject» — незворотна дія (червона межа, AC-APR-06, 07).
  reject: { trigger: "Reject", title: "Reject request", variant: "destructive", submit: "Reject", pending: "Rejecting…" },
  // «Return for revision» — автор виправить і подасть знову (AC-DEC-04, 06): звичайна другорядна дія.
  return: {
    trigger: "Return for revision",
    title: "Return for revision",
    variant: "outline",
    submit: "Return for revision",
    pending: "Returning…",
  },
};

// Рішення з причиною в діалозі: без причини — «Provide a reason», заявка не змінюється. Кожне нове відкриття діалогу
// починає форму заново (ключ раунду), тож помилка попереднього надсилання не лишається на екрані.
function ReasonDialog({ requestId, label, decision }: { requestId: string; label: string; decision: ReasonDecision }) {
  const [round, setRound] = useState(0);
  const text = REASON_DIALOG[decision];
  return (
    <Dialog onOpenChange={(open) => open && setRound((r) => r + 1)}>
      <DialogTrigger
        render={<Button type="button" size="sm" variant={text.variant} aria-label={`${text.trigger}: ${label}`} />}
      >
        {text.trigger}
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{text.title}</DialogTitle>
          <DialogDescription>The requester will see the reason next to the status.</DialogDescription>
        </DialogHeader>
        <ReasonForm key={round} requestId={requestId} decision={decision} />
      </DialogContent>
    </Dialog>
  );
}

function ReasonForm({ requestId, decision }: { requestId: string; decision: ReasonDecision }) {
  const [state, action, pending] = useActionState(decidePurchase.bind(null, requestId, decision), idle);
  const text = REASON_DIALOG[decision];
  const fieldId = `${decision}-reason-${requestId}`;
  return (
    <form action={action} className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor={fieldId}>Reason</Label>
        <Textarea id={fieldId} name="reason" rows={3} maxLength={REASON_LIMIT} />
      </div>
      {state.status === "error" ? (
        <Alert variant="destructive" data-testid="decision-message">
          {state.message}
        </Alert>
      ) : null}
      <DialogFooter>
        <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
        <Button type="submit" variant={text.variant} disabled={pending}>
          {pending ? text.pending : text.submit}
        </Button>
      </DialogFooter>
    </form>
  );
}

// «Approve» — основна дія (суцільна, одна на екран); «Return for revision» і «Reject» — з причиною в діалозі.
// На сторінці заявки схвалювач позначає «Reject line» — позиції йдуть у форму схвалення, а кнопка стає «Partially approve»
// (AC-DEC-01; тексти — таблиця PM, вимога 49).
export function DecisionButtons({
  requestId,
  label,
  rejectedPositions = [],
  onPendingChange,
}: {
  requestId: string;
  label: string;
  rejectedPositions?: readonly number[];
  // Поки схвалення зберігається, сторінка блокує «Reject line» — позначки не мають змінюватись під час запиту.
  onPendingChange?: (pending: boolean) => void;
}) {
  const partial = rejectedPositions.length > 0;
  const [approveState, approve, approving] = useActionState(decidePurchase.bind(null, requestId, "approve"), idle);
  useEffect(() => onPendingChange?.(approving), [approving, onPendingChange]);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={approve}>
          {rejectedPositions.map((p) => (
            <input key={p} type="hidden" name="rejectLine" value={p} />
          ))}
          <Button
            type="submit"
            size="sm"
            disabled={approving}
            aria-label={`${partial ? "Partially approve" : "Approve"}: ${label}`}
          >
            {approving ? "Approving…" : partial ? "Partially approve" : "Approve"}
          </Button>
        </form>
        <ReasonDialog requestId={requestId} label={label} decision="return" />
        <ReasonDialog requestId={requestId} label={label} decision="reject" />
      </div>
      {approveState.status === "error" ? (
        <Alert variant={approveState.message === messageFor("FORBIDDEN") ? "default" : "destructive"} data-testid="decision-message">
          {approveState.message}
        </Alert>
      ) : null}
    </div>
  );
}
