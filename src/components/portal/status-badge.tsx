import { Badge } from "@/components/ui/badge";
import { isPurchaseStatus, STATUS_CLASS, STATUS_LABEL } from "@/lib/purchase/status";

export function StatusBadge({ status }: { status: string }) {
  if (!isPurchaseStatus(status)) return <Badge variant="secondary">{status}</Badge>;
  return (
    <Badge data-testid="purchase-status" className={STATUS_CLASS[status]}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}
