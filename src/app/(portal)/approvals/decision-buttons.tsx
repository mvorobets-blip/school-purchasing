"use client";

import { useActionState } from "react";
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
import { REASON_LIMIT } from "@/lib/purchase/form";
import { decidePurchase, type DecisionState } from "./actions";

const idle: DecisionState = { status: "idle", message: "" };

// «Approve» — основна дія рядка (суцільна); «Reject» — незворотна (червона межа) з причиною в діалозі (AC-APR-06, 07).
export function DecisionButtons({ requestId, label }: { requestId: string; label: string }) {
  const [approveState, approve, approving] = useActionState(decidePurchase.bind(null, requestId, "approve"), idle);
  const [rejectState, reject, rejecting] = useActionState(decidePurchase.bind(null, requestId, "reject"), idle);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <form action={approve}>
          <Button type="submit" size="sm" disabled={approving} aria-label={`Approve: ${label}`}>
            {approving ? "Approving…" : "Approve"}
          </Button>
        </form>
        <Dialog>
          <DialogTrigger render={<Button type="button" size="sm" variant="destructive" aria-label={`Reject: ${label}`} />}>
            Reject
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Reject request</DialogTitle>
              <DialogDescription>The requester will see the reason next to the status.</DialogDescription>
            </DialogHeader>
            <form action={reject} className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor={`reason-${requestId}`}>Reason</Label>
                <Textarea id={`reason-${requestId}`} name="reason" rows={3} maxLength={REASON_LIMIT} />
              </div>
              {rejectState.status === "error" ? (
                <Alert variant="destructive" data-testid="decision-message">
                  {rejectState.message}
                </Alert>
              ) : null}
              <DialogFooter>
                <DialogClose render={<Button type="button" variant="outline" />}>Cancel</DialogClose>
                <Button type="submit" variant="destructive" disabled={rejecting}>
                  {rejecting ? "Rejecting…" : "Reject"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>
      {approveState.status === "error" ? (
        <Alert variant={approveState.message === "Not enough permissions" ? "default" : "destructive"} data-testid="decision-message">
          {approveState.message}
        </Alert>
      ) : null}
    </div>
  );
}
