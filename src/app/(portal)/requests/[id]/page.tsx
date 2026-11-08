import { redirect } from "next/navigation";
import { ForbiddenCard } from "@/components/portal/forbidden-card";
import { BackLink } from "@/components/portal/back-link";
import { RequestDetails, RequestHistory, RequestLines } from "@/components/portal/request-sections";
import { Alert } from "@/components/ui/alert";
import { getCurrentUser } from "@/lib/org/current-user";
import { formatRequestNumber } from "@/lib/purchase/number";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Сторінка заявки. Бачать автор, схвалювач її відділу й адміністратор (RLS). Іншим — «Not enough permissions» без даних:
// не розрізняємо «немає» й «чужа», щоб не розкривати вміст (AC-FRM-08, AC-APR-03).
export default async function RequestPage({ params, searchParams }: PageProps<"/requests/[id]">) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;
  // Звідки прийшли: зі списку «Awaiting decision» (?from=approvals) — туди й «← Назад», інакше — «My requests».
  const fromApprovals = (await searchParams)?.from === "approvals";
  const back = fromApprovals
    ? { href: "/approvals", label: "Awaiting decision" }
    : { href: "/requests", label: "My requests" };

  const forbidden = (
    <ForbiddenCard
      hint="You can open your own requests and requests of departments you approve."
      backHref={back.href}
      backLabel={`Back to ${back.label.toLowerCase()}`}
    />
  );
  if (!UUID.test(id)) return forbidden;

  const supabase = await createClient();
  const { data: request, error } = await supabase
    .from("purchase_requests")
    .select("id, number, department_id, purchase_type, status, reject_reason, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error) return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  if (!request) return forbidden;
  // Автор — ім'я, без імені в профілі — email, і лише якщо заявку дозволено бачити (private.request_author_names;
  // AC-APR-08, 09); ролі, відділів і дозволів автора сторінка не читає (AC-APR-10). Підпис «Author» — таблиця PM (#49).
  // Помилка запиту автора — помилка завантаження, а не «—» замість імені.
  const { data: authorRows, error: authorError } = await supabase.rpc("request_author_names", { p_request_ids: [id] });
  if (authorError) return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  const authorName = authorRows?.[0]?.author_name ?? "—";

  const [linesRes, deptRes, historyRes] = await Promise.all([
    supabase
      .from("purchase_request_lines")
      .select("position, name, purpose, quantity, price")
      .eq("request_id", id)
      .order("position"),
    supabase.from("departments").select("name").eq("id", request.department_id).maybeSingle(),
    // Історія — лише якщо заявку видно (private.request_history: та сама умова, що RLS заявки; AC-HIST-10).
    supabase.rpc("request_history", { p_request_id: id }),
  ]);
  // Помилка завантаження рядків чи відділу — повідомлення, а не порожня таблиця (DESIGN.md §6).
  // Помилка історії не ховає заявку: розділ «History» покаже власне повідомлення (рев'ю CodeRabbit, PR 59).
  if (linesRes.error || deptRes.error) {
    return <Alert variant="destructive">Could not load the request. Refresh the page.</Alert>;
  }

  return (
    <>
      <div className="flex flex-col gap-1">
        <BackLink href={back.href}>{back.label}</BackLink>
        <h1 className="text-2xl font-semibold">
          Purchase <span className="font-mono tabular-nums">{formatRequestNumber(request.number)}</span>
        </h1>
      </div>

      <RequestDetails
        authorName={authorName}
        departmentName={deptRes.data?.name ?? "—"}
        purchaseType={request.purchase_type}
        status={request.status}
        rejectReason={request.reject_reason}
      />
      <RequestLines lines={linesRes.data ?? []} />
      <RequestHistory history={historyRes.data ?? []} failed={Boolean(historyRes.error)} />
    </>
  );
}
