import { redirect } from "next/navigation";
import { BackLink } from "@/components/portal/back-link";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/org/current-user";
import { PURCHASE_TYPE_LABEL, type PurchaseType } from "@/lib/purchase/form";
import { formatRequestNumber } from "@/lib/purchase/number";
import { createClient } from "@/lib/supabase/server";
import { PurchaseForm } from "../../new/purchase-form";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Виправлення поверненої заявки (AC-DEC-07): та сама форма, що «New purchase», заповнена рядками заявки; відділ і тип
// не змінюються (#66). Відкрити може лише автор заявки «Returned for revision»; іншим — «Not enough permissions» без
// даних. Саме подання знову перевіряє private.resubmit_purchase.
export default async function EditRequestPage({ params }: PageProps<"/requests/[id]/edit">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  const forbidden = (
    <ForbiddenCard
      hint="You can edit only your own requests returned for revision."
      backHref="/requests"
      backLabel="Back to my requests"
    />
  );
  if (!UUID.test(id)) return forbidden;

  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("purchase_requests")
    .select("id, number, department_id, purchase_type, return_reason")
    .eq("id", id)
    .eq("author_id", user.id)
    .eq("status", "returned")
    .maybeSingle();
  if (error) return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  // Фільтри author_id і status — у запиті: чужа заявка чи не «Returned for revision» сюди не потрапляє.
  if (!request) return forbidden;

  const [linesRes, deptRes] = await Promise.all([
    supabase.from("purchase_request_lines").select("position, name, purpose, quantity, price").eq("request_id", id).order("position"),
    supabase.from("departments").select("name").eq("id", request.department_id).maybeSingle(),
  ]);
  if (linesRes.error || deptRes.error) {
    return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  }

  const lines = (linesRes.data ?? []).map((l) => ({
    name: l.name,
    purpose: l.purpose,
    quantity: String(l.quantity),
    price: Number(l.price).toFixed(2),
  }));
  const number = formatRequestNumber(request.number);

  return (
    <>
      <div className="flex flex-col gap-1">
        <BackLink href={`/requests/${id}`}>{number}</BackLink>
        <h1 className="text-2xl font-semibold">
          Edit <span className="font-mono tabular-nums">{number}</span>
        </h1>
      </div>
      {/* Що просив схвалювач — перед формою, щоб автор бачив, що виправити (вимога 63, крок 3; AC-DEC-04). */}
      {request.return_reason ? (
        <Alert data-testid="return-reason">
          <span className="font-medium">Return reason:</span> {request.return_reason}
        </Alert>
      ) : null}
      <PurchaseForm
        departments={[{ value: request.department_id, label: deptRes.data?.name ?? "—" }]}
        types={[
          {
            value: request.purchase_type,
            label: PURCHASE_TYPE_LABEL[request.purchase_type as PurchaseType] ?? request.purchase_type,
          },
        ]}
        resubmit={{ requestId: id, lines }}
      />
    </>
  );
}
