import { redirect } from "next/navigation";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { RequestDetails, RequestHeader, RequestHistory, RequestLines } from "@/components/portal/request-sections";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/org/current-user";
import { messageFor } from "@/lib/org/messages";
import { formatRequestNumber } from "@/lib/purchase/number";
import { loadRequestView } from "@/lib/purchase/request-view";
import { createClient } from "@/lib/supabase/server";
import { LineDecision } from "./line-decision";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Звідки прийшли: зі списку «Awaiting decision» (?from=approvals) — туди й «← Назад», інакше — «My requests».
const BACK = {
  approvals: { href: "/approvals", label: "Awaiting decision" },
  requests: { href: "/requests", label: "My requests" },
};

// Сторінка заявки. Бачать автор, схвалювач її відділу й адміністратор (RLS). Іншим — «Not enough permissions» без даних:
// не розрізняємо «немає» й «чужа», щоб не розкривати вміст (AC-FRM-08, AC-APR-03).
export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  const query = await searchParams;
  const back = query?.from === "approvals" ? BACK.approvals : BACK.requests;

  const forbidden = (
    <ForbiddenCard
      hint="You can open your own requests and requests of departments you approve."
      backHref={back.href}
      backLabel={`Back to ${back.label.toLowerCase()}`}
    />
  );
  if (!UUID.test(id)) return forbidden;

  const view = await loadRequestView(await createClient(), id);
  if (view.status === "forbidden") return forbidden;
  if (view.status === "error") return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;

  const { request, lines } = view;
  const number = formatRequestNumber(request.number);

  return (
    <>
      <RequestHeader
        back={back}
        number={number}
        // «Edit» — лише автору поверненої заявки (матриця прав «Редагувати заявку»; права перевіряє resubmit_purchase).
        editHref={request.status === "returned" && request.author_id === user.id ? `/requests/${id}/edit` : null}
      />
      {/* Після повторного подання (AC-DEC-07) — «Purchase submitted» (текст PM, таблиця вимоги 49). */}
      {query?.ok === "RESUBMITTED" ? (
        <Alert role="status" data-testid="purchase-message">
          {messageFor("SUBMITTED")}
        </Alert>
      ) : null}
      <RequestDetails
        authorName={view.authorName}
        departmentName={view.departmentName}
        purchaseType={request.purchase_type}
        status={request.status}
        rejectReason={request.reject_reason}
        returnReason={request.return_reason ?? null}
      />
      {/* Кнопки рішення — лише зручність: права (відділ, не автор, статус) перевіряє private.decide_purchase. */}
      {view.canDecide ? <LineDecision requestId={id} label={number} lines={lines} /> : <RequestLines lines={lines} />}
      <RequestHistory history={view.history} failed={view.historyFailed} />
    </>
  );
}
